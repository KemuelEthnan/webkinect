using Microsoft.Kinect;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace KinectServer
{
    // Handles raw depth data serialization for 3D scanning.
    public static class DepthRawSerializer
    {
        [DataContract]
        class DepthFrameData
        {
            [DataMember(Name = "width")]
            public int Width { get; set; }

            [DataMember(Name = "height")]
            public int Height { get; set; }

            [DataMember(Name = "points")]
            public Point3D[] Points { get; set; }
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
        }

        // Serializes raw depth frame data as JSON for 3D point cloud generation.
        public static string Serialize(DepthImageFrame frame, CoordinateMapper mapper)
        {
            if (frame == null || mapper == null)
                return null;

            short[] depthData = new short[frame.PixelDataLength];
            frame.CopyPixelDataTo(depthData);

            int width = frame.Width;
            int height = frame.Height;

            // Convert depth data to 3D points
            var points = new List<Point3D>();
            
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = y * width + x;
                    int depth = depthData[index] >> DepthImageFrame.PlayerIndexBitmaskWidth;
                    
                    // Filter out invalid depth values
                    if (depth >= Constants.MIN_DEPTH_DISTANCE && depth <= Constants.MAX_DEPTH_DISTANCE)
                    {
                        // Map depth pixel to skeleton space (3D coordinates)
                        DepthImagePoint depthPoint = new DepthImagePoint
                        {
                            X = x,
                            Y = y,
                            Depth = depth
                        };

                        SkeletonPoint skeletonPoint = mapper.MapDepthPointToSkeletonPoint(
                            DepthImageFormat.Resolution640x480Fps30,
                            depthPoint);

                        points.Add(new Point3D
                        {
                            X = skeletonPoint.X,
                            Y = skeletonPoint.Y,
                            Z = skeletonPoint.Z
                        });
                    }
                }
            }

            // Create JSON structure
            DepthFrameData depthFrame = new DepthFrameData
            {
                Width = width,
                Height = height,
                Points = points.ToArray()
            };

            // Serialize to JSON
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(DepthFrameData));
            using (var ms = new MemoryStream())
            {
                serializer.WriteObject(ms, depthFrame);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }
    }
}
