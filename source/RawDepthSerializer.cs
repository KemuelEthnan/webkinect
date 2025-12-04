using Microsoft.Kinect;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;

namespace KinectServer
{
    public static class RawDepthSerializer
    {
        public static string Serialize(DepthImageFrame frame, CoordinateMapper mapper)
        {
            if (frame == null || mapper == null)
            {
                return null;
            }

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

                    points.Add(new
                    {
                        x = point.X,
                        y = point.Y,
                        z = point.Z
                    });
                }
            }

            var serializer = new DataContractJsonSerializer(points.GetType());

            using (var ms = new MemoryStream())
            {
                serializer.WriteObject(ms, points);
                return Encoding.Default.GetString(ms.ToArray());
            }
        }
    }
}