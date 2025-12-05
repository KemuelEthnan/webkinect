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

            try
            {
                var result = new StringBuilder();
                result.Append("{\"skeletons\":[");

                bool firstSkeleton = true;
                foreach (var skeleton in skeletons)
                {
                    if (skeleton.TrackingState == SkeletonTrackingState.Tracked)
                    {
                        if (!firstSkeleton) result.Append(",");
                        firstSkeleton = false;

                        result.Append("{");
                        result.AppendFormat("\"id\":{0},", skeleton.TrackingId);
                        result.AppendFormat("\"position\":{{\"x\":{0},\"y\":{1},\"z\":{2}}},",
                            skeleton.Position.X.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                            skeleton.Position.Y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                            skeleton.Position.Z.ToString("F6", System.Globalization.CultureInfo.InvariantCulture));

                        result.Append("\"joints\":[");

                        bool firstJoint = true;
                        foreach (Joint joint in skeleton.Joints)
                        {
                            if (joint.TrackingState == JointTrackingState.Tracked)
                            {
                                if (!firstJoint) result.Append(",");
                                firstJoint = false;

                                var depthPoint = mapper.MapSkeletonPointToDepthPoint(joint.Position, DepthImageFormat.Resolution640x480Fps30);
                                var colorPoint = mapper.MapSkeletonPointToColorPoint(joint.Position, ColorImageFormat.RgbResolution640x480Fps30);

                                result.Append("{");
                                result.AppendFormat("\"name\":\"{0}\",", joint.JointType.ToString());
                                result.AppendFormat("\"position\":{{\"x\":{0},\"y\":{1},\"z\":{2}}},",
                                    joint.Position.X.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                                    joint.Position.Y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                                    joint.Position.Z.ToString("F6", System.Globalization.CultureInfo.InvariantCulture));
                                result.AppendFormat("\"depth\":{{\"x\":{0},\"y\":{1}}},", depthPoint.X, depthPoint.Y);
                                result.AppendFormat("\"color\":{{\"x\":{0},\"y\":{1}}}", colorPoint.X, colorPoint.Y);
                                result.Append("}");
                            }
                        }

                        result.Append("]}"); // Close joints array and skeleton object
                    }
                }

                result.Append("]}"); // Close skeletons array and root object

                return result.ToString();
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SERIALIZE] ❌ Exception in SerializeSkeletons: " + ex.Message);
                return null;
            }
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

                var pointsJson = new StringBuilder();
                CoordinateMapper coordMapper = sensor.CoordinateMapper;

                int validPoints = 0;
                int skippedPoints = 0;
                int outOfRangeCount = 0;
                int invalidSkeletonCount = 0;

                // IMPORTANT: Downsample to avoid overwhelming WebSocket and client
                // Skip every N pixels to reduce point count (640x480 = 307,200 points)
                // With skipFactor=4, we get ~19,200 points per frame (much more manageable)
                int skipFactor = 4; // Process every 4th pixel horizontally and vertically

                // Sample some depth values for debugging
                int sampleCount = 0;
                int minDepthSeen = int.MaxValue;
                int maxDepthSeen = int.MinValue;

                for (int y = 0; y < depthFrame.Height; y += skipFactor)
                {
                    for (int x = 0; x < depthFrame.Width; x += skipFactor)
                    {
                        int depthIndex = x + y * depthFrame.Width;

                        if (depthIndex >= depthPixels.Length) continue;

                        short depthRaw = depthPixels[depthIndex];

                        // Extract actual depth value (shift right 3 bits for Kinect v1)
                        int depth = depthRaw >> DepthImageFrame.PlayerIndexBitmaskWidth;

                        // Track depth range for debugging
                        if (depth > 0)
                        {
                            minDepthSeen = Math.Min(minDepthSeen, depth);
                            maxDepthSeen = Math.Max(maxDepthSeen, depth);
                            if (sampleCount < 10)
                            {
                                if (sampleCount == 0) Console.WriteLine("[SERIALIZE] Sample depth values (raw >> 3):");
                                Console.WriteLine($"[SERIALIZE]   Pixel ({x},{y}): raw={depthRaw}, depth={depth}");
                                sampleCount++;
                            }
                        }

                        // Filter depth values - accept reasonable range
                        // Kinect v1: typically 400-8000mm (0.4m - 8m) - wider range to capture more
                        if (depth > 400 && depth < 8000)
                        {
                            var depthPoint = new DepthImagePoint
                            {
                                X = x,
                                Y = y,
                                Depth = depthRaw  // Use raw value for API
                            };

                            var skelPoint = coordMapper.MapDepthPointToSkeletonPoint(depthFrame.Format, depthPoint);

                            // Skip invalid skeleton points (NaN or Infinity)
                            if (float.IsNaN(skelPoint.X) || float.IsNaN(skelPoint.Y) || float.IsNaN(skelPoint.Z) ||
                                float.IsInfinity(skelPoint.X) || float.IsInfinity(skelPoint.Y) || float.IsInfinity(skelPoint.Z))
                            {
                                invalidSkeletonCount++;
                                continue;
                            }

                            byte r = 128, g = 128, b = 128; // Default gray color

                            if (colorFrame != null && colorPixels != null)
                            {
                                var colorPoint = coordMapper.MapDepthPointToColorPoint(depthFrame.Format, depthPoint, colorFrame.Format);
                                if (colorPoint.X >= 0 && colorPoint.X < colorFrame.Width && colorPoint.Y >= 0 && colorPoint.Y < colorFrame.Height)
                                {
                                    int colorIndex = (colorPoint.X + colorPoint.Y * colorFrame.Width) * colorFrame.BytesPerPixel;
                                    if (colorIndex >= 0 && colorIndex < colorPixels.Length - (colorFrame.BytesPerPixel - 1))
                                    {
                                        // BGR format in Kinect
                                        r = colorPixels[colorIndex + 2];
                                        g = colorPixels[colorIndex + 1];
                                        b = colorPixels[colorIndex + 0];
                                    }
                                }
                            }

                            // Manual JSON construction to avoid DataContract serialization issues
                            if (validPoints > 0) pointsJson.Append(",");
                            pointsJson.Append("{");
                            pointsJson.AppendFormat("\"x\":{0},\"y\":{1},\"z\":{2},\"r\":{3},\"g\":{4},\"b\":{5}",
                                skelPoint.X.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                                skelPoint.Y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                                skelPoint.Z.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                                r, g, b);
                            pointsJson.Append("}");

                            validPoints++;
                        }
                        else
                        {
                            outOfRangeCount++;
                        }
                    }
                }

                Console.WriteLine("[SERIALIZE] Valid points: " + validPoints + ", Out of range: " + outOfRangeCount + ", Invalid skeleton: " + invalidSkeletonCount);
                Console.WriteLine("[SERIALIZE] Depth frame MinDepth: " + depthFrame.MinDepth + ", MaxDepth: " + depthFrame.MaxDepth);
                if (minDepthSeen != int.MaxValue)
                {
                    Console.WriteLine("[SERIALIZE] Actual depth range seen: " + minDepthSeen + " - " + maxDepthSeen + " mm");
                }

                if (validPoints == 0)
                {
                    Console.WriteLine("[SERIALIZE] WARNING: No valid points found!");
                    Console.WriteLine("[SERIALIZE] This could mean:");
                    Console.WriteLine("[SERIALIZE]   1. No object in Kinect range (0.4m - 8m)");
                    Console.WriteLine("[SERIALIZE]   2. Kinect depth sensor not working");
                    Console.WriteLine("[SERIALIZE]   3. All depth values are invalid or out of range");
                    Console.WriteLine("[SERIALIZE]   4. All skeleton points are NaN/Infinity");
                }

                // Manual JSON construction - this avoids DataContract serialization issues
                var result = new StringBuilder();
                result.Append("{");
                result.AppendFormat("\"mode\":\"{0}\",", Mode.PointCloud.ToString());
                result.Append("\"data\":[");
                result.Append(pointsJson.ToString());
                result.Append("],");
                result.AppendFormat("\"width\":{0},", depthFrame.Width);
                result.AppendFormat("\"height\":{0}", depthFrame.Height);
                result.Append("}");

                string jsonResult = result.ToString();

                if (jsonResult == null || jsonResult.Length == 0)
                {
                    Console.WriteLine("[SERIALIZE] ERROR: JSON result is null or empty!");
                    return null;
                }

                Console.WriteLine("[SERIALIZE] ✅ JSON created: " + jsonResult.Length + " bytes, " + validPoints + " points");

                return jsonResult;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SERIALIZE] ❌ EXCEPTION: " + ex.Message);
                Console.WriteLine("[SERIALIZE] Stack: " + ex.StackTrace);
                if (ex.InnerException != null)
                {
                    Console.WriteLine("[SERIALIZE] Inner exception: " + ex.InnerException.Message);
                }
                return null;
            }
        }

        /// <summary>
        /// Serializes a raw depth frame into a JSON string of skeleton points.
        /// </summary>
        public static string SerializeRawDepth(DepthImageFrame frame, CoordinateMapper mapper)
        {
            if (frame == null || mapper == null) return null;

            try
            {
                var depthPixels = new short[frame.PixelDataLength];
                frame.CopyPixelDataTo(depthPixels);

                var result = new StringBuilder();
                result.Append("[");

                bool first = true;
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

                        if (!first) result.Append(",");
                        first = false;

                        result.Append("{");
                        result.AppendFormat("\"x\":{0},\"y\":{1},\"z\":{2}",
                            point.X.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                            point.Y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture),
                            point.Z.ToString("F6", System.Globalization.CultureInfo.InvariantCulture));
                        result.Append("}");
                    }
                }

                result.Append("]");
                return result.ToString();
            }
            catch (Exception ex)
            {
                Console.WriteLine("[SERIALIZE] ❌ Exception in SerializeRawDepth: " + ex.Message);
                return null;
            }
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
