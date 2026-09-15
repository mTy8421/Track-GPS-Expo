import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { io } from "socket.io-client";

export const BACKGROUND_LOCATION_TASK = "gps-background-location";
export const TRACKING_CONFIG_KEY = "gps-background-config";
export const LAST_LOCATION_KEY = "gps-background-last-location";

export type TrackingConfig = {
  serverUrl: string;
  deviceId: string;
  autoSend: boolean;
};

type LocationTaskData = { locations: Location.LocationObject[] };

TaskManager.defineTask<LocationTaskData>(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations.length) return;

    const latest = data.locations[data.locations.length - 1];
    await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(latest));

    const storedConfig = await AsyncStorage.getItem(TRACKING_CONFIG_KEY);
    if (!storedConfig) return;
    const config = JSON.parse(storedConfig) as TrackingConfig;
    if (!config.autoSend || !config.serverUrl.trim()) return;

    const socket = io(config.serverUrl.trim(), {
      reconnection: false,
      timeout: 5000,
      transports: ["websocket"],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Socket timeout")), 10000);
        socket.once("connect_error", reject);
        socket.once("connect", () => {
          socket.timeout(5000).emit(
            "location:update",
            {
              deviceId: config.deviceId,
              latitude: latest.coords.latitude,
              longitude: latest.coords.longitude,
              accuracy: latest.coords.accuracy ?? 0,
              timestamp: new Date(latest.timestamp).toISOString(),
              ...(latest.coords.altitude == null ? {} : { altitude: latest.coords.altitude }),
              ...(latest.coords.heading == null ? {} : { heading: latest.coords.heading }),
              ...(latest.coords.speed == null ? {} : { speed: latest.coords.speed }),
            },
            (ackError: Error | null) => {
              clearTimeout(timer);
              if (ackError) reject(ackError);
              else resolve();
            },
          );
        });
      });
    } finally {
      socket.disconnect();
    }
  },
);
