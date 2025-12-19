using System;
﻿using System.Collections.Generic;
﻿using System.Linq;
﻿using Fleck;
﻿using Microsoft.Kinect;
﻿using System.IO;
﻿
﻿namespace KinectServer
﻿{
﻿    class Program
﻿    {
﻿        static List<IWebSocketConnection> _clients = new List<IWebSocketConnection>();
﻿        static Skeleton[] _skeletons = new Skeleton[6];
﻿        static volatile Mode _mode = Mode.Color;
﻿        static CoordinateMapper _coordinateMapper;
﻿        static object _modeLock = new object();
﻿        
﻿        // Use the new FusionEngine simulator
﻿        static FusionEngine _fusionEngine = new FusionEngine("output.ply");
﻿
﻿        static void Main(string[] args)
﻿        {
﻿            try
﻿            {
﻿                InitializeConnection();
﻿                InitilizeKinect();
﻿                Console.WriteLine("Server started successfully! Listening on ws://127.0.0.1:8181");
﻿            }
﻿            catch (Exception e)
﻿            {
﻿                Console.WriteLine($"ERROR: Failed to start server! Exception: {e.Message}");
﻿            }
﻿            Console.ReadLine();
﻿        }
﻿
﻿        private static void InitializeConnection()
﻿        {
﻿            var server = new WebSocketServer("ws://127.0.0.1:8181");
﻿            server.Start(socket =>
﻿            {
﻿                socket.OnOpen = () =>
﻿                {
﻿                    _clients.Add(socket);
﻿                    Console.WriteLine($"[WEBSOCKET] Client connected. Total: {_clients.Count}");
﻿                };
﻿
﻿                socket.OnClose = () =>
﻿                {
﻿                    _clients.Remove(socket);
﻿                    Console.WriteLine($"[WEBSOCKET] Client disconnected. Total: {_clients.Count}");
﻿                };
﻿
﻿                socket.OnMessage = message =>
﻿                {
﻿                    Console.WriteLine($"[WEBSOCKET] Received message: \"{message}\"");
﻿                    lock (_modeLock)
﻿                    {
﻿                        switch (message)
﻿                        {
﻿                            // --- Messages for the "Normal" tab ---
﻿                            case "Color":
﻿                                _mode = Mode.Color;
﻿                                break;
﻿                            case "Depth":
﻿                                _mode = Mode.Depth;
﻿                                break;
﻿                            
﻿                            // --- Messages for the "3D Scanning" tab ---
﻿                            case "PointCloud": // Re-interpret this as "Start Scan"
﻿                            case "StartScan":
﻿                                _mode = Mode.PointCloud;
﻿                                _fusionEngine.StartScan();
﻿                                break;
﻿                            
﻿                            case "StopScan":
﻿                                // Stop the scan, get the mesh file path
﻿                                string meshPath = _fusionEngine.StopScanAndExtractMesh();
﻿                                if (meshPath != null && File.Exists(meshPath))
﻿                                {
﻿                                    try
﻿                                    {
﻿                                        // Read the entire mesh file as a byte array
﻿                                        byte[] meshData = File.ReadAllBytes(meshPath);
﻿                                        // Send the binary data to all clients
﻿                                        foreach(var client in _clients)
﻿                                        {
﻿                                            client.Send(meshData);
﻿                                        }
﻿                                        Console.WriteLine($"[WEBSOCKET] Sent mesh file ({meshData.Length} bytes) to {_clients.Count} client(s).");
﻿                                    }
﻿                                    catch (Exception ex)
﻿                                    {
﻿                                        Console.WriteLine($"[ERROR] Failed to read or send mesh file: {ex.Message}");
﻿                                    }
﻿                                }
﻿                                else
﻿                                {
﻿                                     Console.WriteLine($"[ERROR] Mesh file not found at path: {meshPath}");
﻿                                }
﻿                                break;
﻿                                
﻿                            default:
﻿                                Console.WriteLine($"[WARNING] Unknown command: \"{message}\"");
﻿                                break;
﻿                        }
﻿                    }
﻿                };
﻿            });
﻿        }
﻿
﻿        private static void InitilizeKinect()
﻿        {
﻿            var sensor = KinectSensor.KinectSensors.FirstOrDefault();
﻿            if (sensor == null)
﻿            {
﻿                Console.WriteLine("[ERROR] No Kinect sensor found!");
﻿                return;
﻿            }
﻿
﻿            sensor.ColorStream.Enable();
﻿            sensor.DepthStream.Enable();
﻿            sensor.SkeletonStream.Enable();
﻿            
﻿            _coordinateMapper = sensor.CoordinateMapper;
﻿            sensor.AllFramesReady += Sensor_AllFramesReady;
﻿            
﻿            sensor.Start();
﻿            Console.WriteLine("[KINECT] Sensor started successfully!");
﻿        }
﻿
﻿        static void Sensor_AllFramesReady(object sender, AllFramesReadyEventArgs e)
﻿        {
﻿            Mode currentMode;
﻿            lock (_modeLock)
﻿            {
﻿                currentMode = _mode;
﻿            }
﻿
﻿            switch (currentMode)
﻿            {
﻿                case Mode.PointCloud:
﻿                    // In PointCloud mode, we just feed the fusion engine. No data is sent here.
﻿                    _fusionEngine.ProcessFrame();
﻿                    break;
﻿
﻿                                case Mode.Color:
﻿                                    // This logic remains for the "Normal" tab
﻿                                    using (var cFrame = e.OpenColorImageFrame())
﻿                                    {
﻿                                        if (cFrame == null) return;
﻿                                        byte[] colorImage = cFrame.Serialize();
﻿                                        foreach (var socket in _clients) socket.Send(colorImage);
﻿                                    }
﻿                                    using (var sFrame = e.OpenSkeletonFrame())
﻿                                    {
﻿                                         if (sFrame == null) return;
﻿                                         sFrame.CopySkeletonDataTo(_skeletons);
﻿                                         var users = _skeletons.Where(s => s.TrackingState == SkeletonTrackingState.Tracked).ToList();
﻿                                         if (users.Count > 0)
﻿                                         {
﻿                                             string json = JsonSerializer.SerializeSkeletons(users, _coordinateMapper);
﻿                                             foreach (var socket in _clients) socket.Send(json);
﻿                                         }
﻿                                    }
﻿                                    break;
﻿                            }
﻿                        }﻿    }
﻿}
﻿
