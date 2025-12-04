using Microsoft.Kinect;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Windows;

namespace KinectServer
{
    // Handles point cloud serialization for 3D scanning.
    public static class PointCloudSerializer
    {
        [DataContract]
        class PointCloudData
        {
            [DataMember(Name = "width")]
            public int Width { get; set; }

            [DataMember(Name = "height")]
            public int Height { get; set; }

            [DataMember(Name = "points")]
            public List<Point3D> Points { get; set; }
        }

        [DataContract]
        class Point3D
        {
            [DataMember(Name = "x")]
            public float X { get; set; }

            [DataMember(Name = "y")]
            public float Y { get; set; }

            [DataMember(Name = "z")]
            public float Z { get; set; }

            [DataMember(Name = "r")]
            public byte R { get; set; }

            [DataMember(Name = "g")]
            public byte G { get; set; }

            [DataMember(Name = "b")]
            public byte B { get; set; }
        }

        // Serializes depth frame to point cloud with color mapping.
        public static string Serialize(KinectSensor sensor, DepthImageFrame depthFrame, ColorImageFrame colorFrame)
        {
            if (depthFrame == null || sensor == null) return null;

            short[] depthPixels = new short[depthFrame.PixelDataLength];
            depthFrame.CopyPixelDataTo(depthPixels);

            byte[] colorPixels = null;
            if (colorFrame != null)
            {
                colorPixels = new byte[colorFrame.PixelDataLength];
                colorFrame.CopyPixelDataTo(colorPixels);
            }

            List<object> points = new List<object>();
            CoordinateMapper coordMapper = sensor.CoordinateMapper;

            for (int depthIndex = 0; depthIndex < depthPixels.Length; depthIndex++)
            {
                short depth = depthPixels[depthIndex];
                if (depth >= depthFrame.MinDepth && depth <= depthFrame.MaxDepth)
                {
                    DepthImagePoint depthPoint = new DepthImagePoint
                    {
                        X = depthIndex % depthFrame.Width,
                        Y = depthIndex / depthFrame.Width,
                        Depth = depth
                    };

                    SkeletonPoint skelPoint = coordMapper.MapDepthPointToSkeletonPoint(depthFrame.Format, depthPoint);

                    byte r = 255, g = 255, b = 255;

                    if (colorFrame != null && colorPixels != null)
                    {
                        ColorImagePoint colorPoint = coordMapper.MapDepthPointToColorPoint(depthFrame.Format, depthPoint, colorFrame.Format);
                        
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
                }
            }
            
            return FrameSerializer.Serialize(new { mode = Mode.PointCloud.ToString(), data = points, width = depthFrame.Width, height = depthFrame.Height });
        }

        // Serializes an object to JSON.
        private static string Serialize(object obj)
        {
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(obj.GetType());

            using (MemoryStream ms = new MemoryStream())
            {
                serializer.WriteObject(ms, obj);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }
    }
}
