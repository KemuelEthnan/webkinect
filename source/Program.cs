using System;
using System.Collections.Generic;
using System.Linq;
using Fleck;
using Microsoft.Kinect;
using System.Runtime.InteropServices;

namespace KinectServer
{
    class Program
    {
        [DllImport("kernel32.dll")]
        static extern IntPtr GetConsoleWindow();
        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        const int CONSOLE_HIDE = 0;
        const int CONSOLE_SHOW = 5;

        static List<IWebSocketConnection> _clients = new List<IWebSocketConnection>();
        static Skeleton[] _skeletons = new Skeleton[6];
        static volatile Mode _mode = Mode.Color;
        static CoordinateMapper _coordinateMapper;
        static object _modeLock = new object();

        static void Main(string[] args)
        {
            ShowWindow(GetConsoleWindow(), CONSOLE_SHOW);

            Console.WriteLine("========================================");
            Console.WriteLine("Websocket Microsoft Kinect Server");
            Console.WriteLine("========================================");
            Console.WriteLine("Server starting...");

            try
            {
                InitializeConnection();
                InitilizeKinect();
                Console.WriteLine("Server started successfully!");
                Console.WriteLine("Listening on ws://127.0.0.1:8181");
                Console.WriteLine("Press any key to exit...");
            }
            catch (Exception e)
            {
                Console.WriteLine("ERROR: Failed to start server!");
                Console.WriteLine("Exception: " + e.Message);
                Console.WriteLine("Stack trace: " + e.StackTrace);
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                System.Environment.Exit(1);
            }
            Console.ReadLine();
        }

        private static void InitializeConnection()
        {
            var server = new WebSocketServer("ws://127.0.0.1:8181");
          
            server.Start(socket =>
            {
                socket.OnOpen = () =>
                {
                    _clients.Add(socket);
                    Console.WriteLine("[WEBSOCKET] Client connected. Total clients: " + _clients.Count);
                };

                socket.OnClose = () =>
                {
                    _clients.Remove(socket);
                    Console.WriteLine("[WEBSOCKET] Client disconnected. Total clients: " + _clients.Count);
                };

                socket.OnMessage = message =>
                {
                    if (message == null)
                    {
                        Console.WriteLine("[WEBSOCKET] ❌ Received NULL message!");
                        return;
                    }
                    
                    string trimmedMessage = message.Trim();
                    Console.WriteLine("[WEBSOCKET] ========================================");
                    Console.WriteLine("[WEBSOCKET] Received message: \"" + trimmedMessage + "\"");
                    Console.WriteLine("[WEBSOCKET] Message length: " + message.Length + " chars");
                    Console.WriteLine("[WEBSOCKET] Message bytes: " + System.Text.Encoding.UTF8.GetBytes(message).Length);
                    
                    lock (_modeLock)
                    {
                        Mode previousMode = _mode;
                        Console.WriteLine("[WEBSOCKET] Current mode BEFORE switch: " + previousMode);
                        
                        bool modeChanged = false;
                        
                        switch (trimmedMessage)
                        {
                            case "Color":
                                _mode = Mode.Color;
                                modeChanged = (previousMode != _mode);
                                Console.WriteLine("[MODE] Setting mode to: Color");
                                break;
                            case "Depth":
                                _mode = Mode.Depth;
                                modeChanged = (previousMode != _mode);
                                Console.WriteLine("[MODE] Setting mode to: Depth");
                                break;
                            case "PointCloud":
                                _mode = Mode.PointCloud;
                                modeChanged = (previousMode != _mode);
                                Console.WriteLine("[MODE] ⭐⭐⭐ SETTING MODE TO POINTCLOUD ⭐⭐⭐");
                                Console.WriteLine("[MODE] Previous mode was: " + previousMode);
                                break;
                            case "RawDepth":
                                _mode = Mode.RawDepth;
                                modeChanged = (previousMode != _mode);
                                Console.WriteLine("[MODE] Setting mode to: RawDepth");
                                break;
                            default:
                                Console.WriteLine("[WARNING] ⚠️ Unknown mode request: \"" + trimmedMessage + "\"");
                                Console.WriteLine("[WARNING] Valid modes are: Color, Depth, PointCloud, RawDepth");
                                break;
                        }

                        Console.WriteLine("[WEBSOCKET] Current mode AFTER switch: " + _mode);
                        
                        if (modeChanged)
                        {
                            Console.WriteLine("[MODE] ✅✅✅ MODE CHANGED from " + previousMode + " to " + _mode + " ✅✅✅");
                        }
                        else
                        {
                            Console.WriteLine("[MODE] Mode unchanged: " + _mode);
                        }
                        Console.WriteLine("[WEBSOCKET] ========================================");
                    }
                };
            });
        }

        private static void InitilizeKinect()
        {
            KinectSensor sensor = null;
            try
            {
                if (KinectSensor.KinectSensors.Count == 0)
                {
                    Console.WriteLine("[ERROR] No Kinect sensor found!");
                    Console.WriteLine("Please connect a Kinect sensor and try again.");
                    return;
                }
                
                sensor = KinectSensor.KinectSensors[0];
                Console.WriteLine("[KINECT] Kinect sensor found: " + sensor.UniqueKinectId);
            }
            catch (Exception e)
            {
                Console.WriteLine("[ERROR] Exception while finding Kinect sensor:");
                Console.WriteLine("  " + e.Message);
                return;
            }
            
            if(sensor != null)
            {
                try
                {
                    sensor.ColorStream.Enable();
                    sensor.DepthStream.Enable();
                    sensor.SkeletonStream.Enable();
                    Console.WriteLine("[KINECT] Streams enabled: Color, Depth, Skeleton");

                    sensor.AllFramesReady += Sensor_AllFramesReady;
                    _coordinateMapper = sensor.CoordinateMapper;

                    sensor.Start();
                    Console.WriteLine("[KINECT] Sensor started successfully!");
                }
                catch (Exception e)
                {
                    Console.WriteLine("[ERROR] Failed to start Kinect sensor:");
                    Console.WriteLine("  " + e.Message);
                }
            }
        }

        static void Sensor_AllFramesReady(object sender, AllFramesReadyEventArgs e)
        {
            var sensor = sender as KinectSensor;
            if (sensor == null) return;

            Mode currentMode;
            lock (_modeLock)
            {
                currentMode = _mode;
            }
            
            // Log mode setiap 30 frame untuk debugging (sekitar 1 detik)
            if (DateTime.Now.Millisecond % 1000 < 33)
            {
                Console.WriteLine("[FRAME] Processing frame in mode: " + currentMode + " (Clients: " + _clients.Count + ")");
            }

            switch (currentMode)
            {
                case Mode.PointCloud:
                    // CRITICAL: Always try to send data, even if depth frame is null
                    // This ensures client knows server is responding
                    using (var dFrame = e.OpenDepthImageFrame())
                    using (var cFrame = e.OpenColorImageFrame())
                    {
                        // Log every frame to help debugging
                        Console.WriteLine("[POINTCLOUD] Frame event triggered. Depth frame: " + (dFrame != null ? "OK" : "NULL") + ", Clients: " + _clients.Count);
                        
                        if (dFrame == null)
                        {
                            Console.WriteLine("[POINTCLOUD] ⚠️ Depth frame is NULL");
                            
                            // ALWAYS send response, even if empty
                            try
                            {
                                string emptyResponse = JsonSerializer.ToJson(new { mode = "PointCloud", data = new object[0], width = 640, height = 480 });
                                foreach (var socket in _clients)
                                {
                                    if (socket != null && socket.IsAvailable)
                                    {
                                        socket.Send(emptyResponse);
                                        Console.WriteLine("[POINTCLOUD] Sent empty response to client");
                                    }
                                }
                            }
                            catch (Exception ex2)
                            {
                                Console.WriteLine("[POINTCLOUD] ❌ Error sending empty response: " + ex2.Message);
                            }
                            return;
                        }

                        Console.WriteLine("[POINTCLOUD] ✅ Depth frame: " + dFrame.Width + "x" + dFrame.Height);

                        try
                        {
                            string json = JsonSerializer.SerializePointCloud(sensor, dFrame, cFrame);
                            
                            if (json == null)
                            {
                                Console.WriteLine("[POINTCLOUD] ❌ SerializePointCloud returned NULL!");
                                // Send empty response anyway
                                json = JsonSerializer.ToJson(new { mode = "PointCloud", data = new object[0], width = dFrame.Width, height = dFrame.Height });
                            }
                            
                            if (json != null && json.Length > 0)
                            {
                                int pointCount = 0;
                                if (json.Contains("\"data\""))
                                {
                                    pointCount = (json.Length - json.Replace("\"x\":", "").Length) / 5;
                                }

                                Console.WriteLine("[POINTCLOUD] ✅ Serialized: ~" + pointCount + " points, " + json.Length + " bytes");

                                int sentCount = 0;
                                foreach (var socket in _clients)
                                {
                                    if (socket == null)
                                    {
                                        Console.WriteLine("[POINTCLOUD] ⚠️ Socket is NULL!");
                                        continue;
                                    }
                                    
                                    if (!socket.IsAvailable)
                                    {
                                        Console.WriteLine("[POINTCLOUD] ⚠️ Socket is not available!");
                                        continue;
                                    }
                                    
                                    try
                                    {
                                        socket.Send(json);
                                        sentCount++;
                                        Console.WriteLine("[POINTCLOUD] ✅ Sent to client #" + sentCount);
                                    }
                                    catch (Exception sendEx)
                                    {
                                        Console.WriteLine("[POINTCLOUD] ❌ Send error: " + sendEx.Message);
                                        Console.WriteLine("[POINTCLOUD] Stack: " + sendEx.StackTrace);
                                    }
                                }

                                Console.WriteLine("[POINTCLOUD] ✅✅✅ Sent to " + sentCount + "/" + _clients.Count + " clients");
                                
                                if (sentCount == 0)
                                {
                                    Console.WriteLine("[POINTCLOUD] ❌❌❌ WARNING: No clients received data! Check socket connection!");
                                }
                            }
                            else
                            {
                                Console.WriteLine("[POINTCLOUD] ⚠️ JSON is null or empty");
                                
                                // Send empty response
                                try
                                {
                                    string emptyResponse = JsonSerializer.ToJson(new { mode = "PointCloud", data = new object[0], width = dFrame.Width, height = dFrame.Height });
                                    foreach (var socket in _clients)
                                    {
                                        if (socket != null && socket.IsAvailable)
                                        {
                                            socket.Send(emptyResponse);
                                        }
                                    }
                                    Console.WriteLine("[POINTCLOUD] Sent empty response");
                                }
                                catch (Exception ex2)
                                {
                                    Console.WriteLine("[POINTCLOUD] Error: " + ex2.Message);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("[POINTCLOUD] ❌❌❌ EXCEPTION:");
                            Console.WriteLine("  Message: " + ex.Message);
                            Console.WriteLine("  Stack: " + ex.StackTrace);
                            if (ex.InnerException != null)
                            {
                                Console.WriteLine("  Inner: " + ex.InnerException.Message);
                            }
                            
                            // Try to send error response
                            try
                            {
                                string errorResponse = JsonSerializer.ToJson(new { mode = "PointCloud", data = new object[0], width = 640, height = 480, error = ex.Message });
                                foreach (var socket in _clients)
                                {
                                    if (socket != null && socket.IsAvailable)
                                    {
                                        socket.Send(errorResponse);
                                    }
                                }
                            }
                            catch { }
                        }
                    }
                    break;

                case Mode.Color:
                    using (var sFrame = e.OpenSkeletonFrame())
                    {
                        if (sFrame != null)
                        {
                            sFrame.CopySkeletonDataTo(_skeletons);
                            var users = _skeletons.Where(s => s.TrackingState == SkeletonTrackingState.Tracked).ToList();
                            if (users.Count > 0)
                            {
                                string json = JsonSerializer.SerializeSkeletons(users, sensor.CoordinateMapper);
                                if (json != null && json.Length > 0)
                                {
                                    if (DateTime.Now.Millisecond % 1000 < 50)
                                    {
                                        Console.WriteLine("[COLOR] Sending skeleton data (" + users.Count + " users)");
                                    }
                                    
                                    foreach (var socket in _clients)
                                    {
                                        if (socket != null && socket.IsAvailable)
                                        {
                                            socket.Send(json);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    using (var cFrame = e.OpenColorImageFrame())
                    {
                        if (cFrame != null)
                        {
                        }
                    }
                    break;

                case Mode.Depth:
                    using (var dFrame = e.OpenDepthImageFrame())
                    {
                        if (dFrame != null)
                        {
                        }
                    }
                    break;

                case Mode.RawDepth:
                    using (var dFrame = e.OpenDepthImageFrame())
                    {
                        if (dFrame != null)
                        {
                            string json = JsonSerializer.SerializeRawDepth(dFrame, sensor.CoordinateMapper);
                            if (json != null)
                            {
                                foreach (var socket in _clients) socket.Send(json);
                            }
                        }
                    }
                    break;
            }
        }

    }
}
