import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  BACKGROUND_LOCATION_TASK,
  LAST_LOCATION_KEY,
  TRACKING_CONFIG_KEY,
} from "../background-location";

type ConnectionStatus = "offline" | "connecting" | "online";
type LiveLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: string;
};

const C = {
  bg: "#F5F7F4",
  card: "#FFFFFF",
  ink: "#142019",
  muted: "#68736C",
  line: "#E4E9E5",
  green: "#1D7A4A",
  orange: "#F0A33B",
  red: "#C94B42",
};

export default function Index() {
  const insets = useSafeAreaInsets();
  const socketRef = useRef<Socket | null>(null);
  const deviceIdRef = useRef("truck-01");
  const [serverUrl] = useState("localhost:3000/tracking");
  const [deviceId] = useState("truck-01");
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [autoSend] = useState(true);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);
  useEffect(() => {
    if (isTracking)
      AsyncStorage.setItem(
        TRACKING_CONFIG_KEY,
        JSON.stringify({ serverUrl, deviceId, autoSend }),
      ).catch(() => undefined);
  }, [autoSend, deviceId, isTracking, serverUrl]);
  useEffect(() => {
    let active = true;
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .then((started) => active && setIsTracking(started))
      .catch(() => undefined);
    const timer = setInterval(async () => {
      const stored = await AsyncStorage.getItem(LAST_LOCATION_KEY);
      if (!active || !stored) return;
      try {
        const position = JSON.parse(stored) as Location.LocationObject;
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? 0,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: new Date(position.timestamp).toISOString(),
        });
      } catch {
        /* Ignore malformed cached values. */
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const disconnect = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus("offline");
  };
  const connect = () => {
    disconnect();
    if (!serverUrl.trim()) return;
    setStatus("connecting");
    const socket = io(serverUrl.trim(), {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 5000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setStatus("online");
    });
    socket.on("connect_error", () => {
      setStatus("connecting");
    });
    socket.on("disconnect", () => {
      setStatus("offline");
    });
  };
  const emitWithAck = (event: string, payload: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(5000).emit(event, payload, () => undefined);
  };
  const locationPayload = (position: LiveLocation) => ({
    deviceId: deviceIdRef.current,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy,
    timestamp: position.timestamp,
    ...(position.altitude === null ? {} : { altitude: position.altitude }),
    ...(position.heading === null ? {} : { heading: position.heading }),
    ...(position.speed === null ? {} : { speed: position.speed }),
  });

  const stopTracking = async () => {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setIsTracking(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      setIsTracking(true);
    }
  };
  const startTracking = async () => {
    try {
      if (
        await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      )
        return setIsTracking(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      if (Platform.OS === "android")
        await new Promise<void>((resolve) =>
          Alert.alert(
            "อนุญาตตำแหน่งตลอดเวลา",
            "เพื่อให้บันทึกเส้นทางต่อได้เมื่อปิดหน้าจอ กรุณาเลือกอนุญาตตลอดเวลาในหน้าการตั้งค่าถัดไป",
            [{ text: "ดำเนินการต่อ", onPress: () => resolve() }],
            { cancelable: false },
          ),
        );
      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== "granted") return;
      await AsyncStorage.setItem(
        TRACKING_CONFIG_KEY,
        JSON.stringify({ serverUrl, deviceId, autoSend }),
      );
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "กำลังติดตามตำแหน่ง",
          notificationBody: "แอปกำลังส่งตำแหน่งในเบื้องหลัง",
        },
      });
      setIsTracking(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setIsTracking(false);
    }
  };

  // Startup is intentionally run once with the initial configuration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    connect();
    void startTracking();
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const statusLabel =
    status === "online"
      ? "เชื่อมต่อแล้ว"
      : status === "connecting"
        ? "กำลังเชื่อมต่อ"
        : "ออฟไลน์";
  const lastUpdate = location
    ? new Date(location.timestamp).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    : "รอสัญญาณ GPS";

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>TRACK</Text>
            <Text style={styles.device}>{deviceId}</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              status === "online" && styles.statusOnline,
              status === "connecting" && styles.statusConnecting,
            ]}
          />
          <Text style={styles.statusText}>{statusLabel}</Text>
          <Text style={styles.statusDivider}>·</Text>
          <Text style={styles.statusMuted}>
            {isTracking ? "GPS ทำงานอยู่" : "GPS หยุดอยู่"}
          </Text>
        </View>
        <View style={[styles.heroCard, isTracking && styles.heroCardActive]}>
          <View style={[styles.signal, isTracking && styles.signalActive]}>
            <Ionicons
              name={isTracking ? "navigate" : "location-outline"}
              size={30}
              color={isTracking ? "#FFFFFF" : C.muted}
            />
          </View>
          <Text style={styles.heroKicker}>
            {isTracking ? "กำลังติดตามตำแหน่ง" : "การติดตามหยุดอยู่"}
          </Text>
          <Text style={styles.heroTitle}>
            {location ? location.latitude.toFixed(6) : "—"}
          </Text>
          <Text style={styles.heroLongitude}>
            {location ? location.longitude.toFixed(6) : "กำลังค้นหาตำแหน่ง"}
          </Text>
          <Text style={styles.updated}>อัปเดตล่าสุด {lastUpdate}</Text>
        </View>
        <View style={styles.metrics}>
          <Metric
            icon="locate-outline"
            label="ความแม่นยำ"
            value={location ? `${location.accuracy.toFixed(0)} ม.` : "—"}
          />
          <Metric
            icon="speedometer-outline"
            label="ความเร็ว"
            value={
              location?.speed == null
                ? "—"
                : `${(location.speed * 3.6).toFixed(1)} กม./ชม.`
            }
          />
          <Metric
            icon="trending-up-outline"
            label="ระดับความสูง"
            value={
              location?.altitude == null
                ? "—"
                : `${location.altitude.toFixed(0)} ม.`
            }
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void (isTracking ? stopTracking() : startTracking())}
          style={({ pressed }) => [
            styles.mainButton,
            isTracking && styles.stopButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={isTracking ? "stop" : "navigate"}
            size={19}
            color="#FFFFFF"
          />
          <Text style={styles.mainButtonText}>
            {isTracking ? "หยุดติดตาม" : "เริ่มติดตาม"}
          </Text>
        </Pressable>
        <View style={styles.quickRow}>
          <Pressable
            disabled={!location || status !== "online"}
            onPress={() =>
              location &&
              emitWithAck("location:update", locationPayload(location))
            }
            style={[
              styles.quickButton,
              (!location || status !== "online") && styles.disabled,
            ]}
          >
            <Ionicons name="paper-plane-outline" size={18} color={C.ink} />
            <Text style={styles.quickText}>ส่งตอนนี้</Text>
          </Pressable>
          <Pressable
            onPress={() => emitWithAck("tracking:subscribe", { deviceId })}
            style={styles.quickButton}
          >
            <Ionicons name="radio-outline" size={19} color={C.ink} />
            <Text style={styles.quickText}>ติดตามอุปกรณ์</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={C.green} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  brand: {
    color: C.green,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  device: { color: C.ink, fontSize: 22, fontWeight: "800", marginTop: 3 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
    marginRight: 7,
  },
  statusOnline: { backgroundColor: C.green },
  statusConnecting: { backgroundColor: C.orange },
  statusText: { color: C.ink, fontSize: 13, fontWeight: "700" },
  statusDivider: { color: "#B3BBB5", marginHorizontal: 7 },
  statusMuted: { color: C.muted, fontSize: 13 },
  heroCard: {
    alignItems: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  heroCardActive: { borderColor: "#CFE5D8" },
  signal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 19,
  },
  signalActive: { backgroundColor: C.green },
  heroKicker: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 11,
  },
  heroTitle: {
    color: C.ink,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  heroLongitude: {
    color: C.ink,
    fontSize: 21,
    fontWeight: "600",
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  updated: { color: C.muted, fontSize: 11, marginTop: 18 },
  metrics: { flexDirection: "row", gap: 9, marginTop: 10 },
  metric: {
    flex: 1,
    minHeight: 108,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    padding: 13,
    justifyContent: "flex-end",
  },
  metricValue: { color: C.ink, fontSize: 15, fontWeight: "800", marginTop: 12 },
  metricLabel: { color: C.muted, fontSize: 10, marginTop: 3 },
  mainButton: {
    height: 56,
    borderRadius: 17,
    backgroundColor: C.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 22,
  },
  stopButton: { backgroundColor: C.ink },
  mainButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  quickRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  quickButton: {
    flex: 1,
    height: 50,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  quickText: { color: C.ink, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
