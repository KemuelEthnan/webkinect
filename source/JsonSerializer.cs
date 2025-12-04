using Microsoft.Kinect;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;

namespace KinectServer
{
    /// <summary>
    /// A single, authoritative class for all JSON serialization tasks in this project.
    /// This replaces the multiple, inconsistent serializer classes.
    /// </summary>
    public static class JsonSerializer
    {
        /// <summary>
        /// Serializes a list of tracked skeletons into a JSON string.
        /// </summary>
        public static string SerializeSkeletons(List<Skeleton> skeletons, CoordinateMapper mapper)
        {
            if (skeletons == null || mapper == null) return null;

            var trackedSkeletons = new List<object>();

            foreach (var skeleton in skeletons)
            {
                if (skeleton.TrackingState == SkeletonTrackingState.Tracked)
                {
                    var joints = new List<object>();
                    foreach (Joint joint in skeleton.Joints)
                    {
                        if (joint.TrackingState == JointTrackingState.Tracked)
                        {
                            var depthPoint = mapper.MapSkeletonPointToDepthPoint(joint.Position, DepthImageFormat.Resolution640x480Fps30);
                            var colorPoint = mapper.MapSkeletonPointToColorPoint(joint.Position, ColorImageFormat.RgbResolution640x480Fps30);

                            joints.Add(new
                            {
                                name = joint.JointType.ToString(),
                                position = new { x = joint.Position.X, y = joint.Position.Y, z = joint.Position.Z },
                                depth = new { x = depthPoint.X, y = depthPoint.Y },
                                color = new { x = colorPoint.X, y = colorPoint.Y }
                            });
                        }
                    }

                    trackedSkeletons.Add(new
                    {
                        id = skeleton.TrackingId,
                        position = new { x = skeleton.Position.X, y = skeleton.Position.Y, z = skeleton.Position.Z },
                        joints = joints
                    });
                }
            }
            return ToJson(new { skeletons = trackedSkeletons });
        }

        public static string SerializePointCloud(KinectSensor sensor, DepthImageFrame depthFrame, ColorImageFrame colorFrame)
        {
            if (depthFrame == null || sensor == null)
            {
                Console.WriteLine("[SERIALIZE] ERROR: depthFrame or sensor is null!");
                return null;
            }

            try
            {
                short[] depthPixels = new short[depthFrame.PixelDataLength];
                depthFrame.CopyPixelDataTo(depthPixels);

                byte[] colorPixels = null;
                if (colorFrame != null)
                {
                    colorPixels = new byte[colorFrame.PixelDataLength];
                    colorFrame.CopyPixelDataTo(colorPixels);
                }

                var points = new List<object>();
                CoordinateMapper coordMapper = sensor.CoordinateMapper;

                int validPoints = 0;
                int skippedPoints = 0;

                for (int depthIndex = 0; depthIndex < depthPixels.Length; depthIndex++)
                {
                    short depth = depthPixels[depthIndex];
                    if (depth >= depthFrame.MinDepth && depth <= depthFrame.MaxDepth)
                    {
                        var depthPoint = new DepthImagePoint
                        {
                            X = depthIndex % depthFrame.Width,
                            Y = depthIndex / depthFrame.Width,
                            Depth = depth
                        };

                        var skelPoint = coordMapper.MapDepthPointToSkeletonPoint(depthFrame.Format, depthPoint);

                        byte r = 255, g = 255, b = 255;

                        if (colorFrame != null && colorPixels != null)
                        {
                            var colorPoint = coordMapper.MapDepthPointToColorPoint(depthFrame.Format, depthPoint, colorFrame.Format);
                            if (colorPoint.X >= 0 && colorPoint.X < colorFrame.Width && colorPoint.Y >= 0 && colorPoint.Y < colorFrame.Height)
                            {
                                int colorIndex = (colorPoint.X + colorPoint.Y * colorFrame.Width) * colorFrame.BytesPerPixel;
                                if (colorIndex >= 0 && colorIndex < colorPixels.Length - (colorFrame.BytesPerPixel - 1))
                                {
                                    r = colorPixels[colorIndex + 2];
                                    g = colorPixels[colorIndex + 1];
                                    b = colorPixels[colorIndex + 0];
                                }
                            }
                        }
                        points.Add(new { x = skelPoint.X, y = skelPoint.Y, z = skelPoint.Z, r, g, b });
                        validPoints++;
                    }
                    else
                    {
                        skippedPoints++;
                    }
                }

                Console.WriteLine("[SERIALIZE] Valid points: " + validPoints + ", Skipped: " + skippedPoints);

                if (points.Count == 0)
                {
                    Console.WriteLine("[SERIALIZE] WARNING: No valid points found! All depth values out of range.");
                    Console.WriteLine("[SERIALIZE] Depth range: " + depthFrame.MinDepth + " - " + depthFrame.MaxDepth);
                }

                var result = ToJson(new { mode = Mode.PointCloud.ToString(), data = points, width = depthFrame.Width, height = depthFrame.Height });
                
                if (result == null)
                {
                    Console.WriteLine("[SERIALIZE] ERROR: ToJson returned null!");
                }
                else
                {
                    Console.WriteLine("[SERIALIZE] JSON created: " + result.Length + " bytes, " + points.Count + " points");
                }
                
                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SERIALIZE] EXCEPTION: " + ex.Message);
                Console.WriteLine("[SERIALIZE] Stack: " + ex.StackTrace);
                return null;
            }
        }

        /// <summary>
        /// Serializes a raw depth frame into a JSON string of skeleton points.
        /// </summary>
        public static string SerializeRawDepth(DepthImageFrame frame, CoordinateMapper mapper)
        {
            if (frame == null || mapper == null) return null;

            var points = new List<object>();
            var depthPixels = new short[frame.PixelDataLength];
            frame.CopyPixelDataTo(depthPixels);

            for (int i = 0; i < depthPixels.Length; i++)
            {
                var depth = depthPixels[i] >> 3;
                if (depth > 400 && depth < 10000)
                {
                    var point = mapper.MapDepthPointToSkeletonPoint(frame.Format, new DepthImagePoint()
                    {
                        X = i % frame.Width,
                        Y = i / frame.Width,
                        Depth = depthPixels[i]
                    });
                    points.Add(new { x = point.X, y = point.Y, z = point.Z });
                }
            }
            return ToJson(points);
        }

        public static string ToJson(object obj)
        {
            var serializer = new DataContractJsonSerializer(obj.GetType());
            using (var ms = new MemoryStream())
            {
                serializer.WriteObject(ms, obj);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }
    }
}
