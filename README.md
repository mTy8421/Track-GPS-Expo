# Track GPS

แอปติดตามตำแหน่งสำหรับอุปกรณ์พกพา พัฒนาด้วย Expo SDK 54 และ React Native แอปอ่านตำแหน่งทั้งขณะเปิดใช้งานและขณะทำงานเบื้องหลัง เก็บตำแหน่งล่าสุดไว้ในเครื่อง และส่งข้อมูลไปยังเซิร์ฟเวอร์ผ่าน Socket.IO

## ความสามารถหลัก

- ติดตาม latitude และ longitude แบบต่อเนื่อง
- แสดงความแม่นยำ ความเร็ว ระดับความสูง และเวลาอัปเดตล่าสุด
- ทำงานเบื้องหลังด้วย `expo-location` และ `expo-task-manager`
- เก็บค่าตั้งต้นและตำแหน่งล่าสุดด้วย AsyncStorage
- ส่งตำแหน่งอัตโนมัติหรือส่งทันทีผ่าน Socket.IO
- แสดงสถานะการเชื่อมต่อเซิร์ฟเวอร์และสถานะ GPS

## เทคโนโลยี

- Expo SDK 54
- React Native 0.81 และ React 19.1
- Expo Router 6
- Expo Location และ Expo TaskManager
- Socket.IO Client
- TypeScript

## ความต้องการของระบบ

- Node.js 20.19.x ขึ้นไป
- npm
- Android Studio และ Android SDK สำหรับรันบน Android
- macOS และ Xcode สำหรับรันบน iOS
- อุปกรณ์จริงหรือ emulator/simulator ที่เปิดใช้งาน Location
- Socket.IO server ที่รองรับ event ตามหัวข้อ [รูปแบบการเชื่อมต่อกับเซิร์ฟเวอร์](#รูปแบบการเชื่อมต่อกับเซิร์ฟเวอร์)

## เริ่มต้นใช้งาน

ติดตั้ง dependencies:

```bash
npm install
```

ก่อนรัน ให้แก้ URL ของ Socket.IO server ใน `app/index.tsx`:

```ts
const [serverUrl] = useState("http://192.168.1.100:3000/tracking");
```

หากทดสอบบนโทรศัพท์จริง ห้ามใช้ `localhost` เว้นแต่เซิร์ฟเวอร์ทำงานอยู่บนโทรศัพท์เครื่องนั้น ให้ใช้ IP address ของคอมพิวเตอร์ในเครือข่ายเดียวกันหรือ URL ที่อุปกรณ์เข้าถึงได้

สร้างและเปิดแอปบน Android:

```bash
npm run android
```

หรือบน iOS:

```bash
npm run ios
```

หลังเปิดแอป ให้ยอมรับสิทธิ์ตำแหน่งขณะใช้งานและตำแหน่งเบื้องหลัง บน Android ให้เลือกอนุญาตตำแหน่งตลอดเวลาเมื่อระบบเปิดหน้าตั้งค่าให้

> แอปใช้ native configuration สำหรับ background location จึงควรทดสอบด้วย development build หรือ native build โดยเฉพาะบน iOS ซึ่ง background location ไม่รองรับใน Expo Go

## คำสั่งที่ใช้บ่อย

| คำสั่ง | รายละเอียด |
| --- | --- |
| `npm start` | เปิด Expo development server |
| `npm run android` | สร้างและเปิด native Android app |
| `npm run ios` | สร้างและเปิด native iOS app |
| `npm run web` | เปิดเวอร์ชันเว็บ |
| `npm run lint` | ตรวจสอบโค้ดด้วย ESLint |

เวอร์ชันเว็บเหมาะสำหรับดูหน้าจอเท่านั้น ความสามารถด้าน background location และ native permissions แตกต่างจาก Android/iOS

## รูปแบบการเชื่อมต่อกับเซิร์ฟเวอร์

ค่าเริ่มต้นปัจจุบันคือ:

- Server URL: `localhost:3000/tracking`
- Device ID: `truck-01`
- Auto send: เปิดใช้งาน

แอปส่ง event `location:update` พร้อม payload รูปแบบต่อไปนี้:

```json
{
  "deviceId": "truck-01",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "accuracy": 10,
  "timestamp": "2026-09-15T12:00:00.000Z",
  "altitude": 4.5,
  "heading": 90,
  "speed": 8.2
}
```

ฟิลด์ `altitude`, `heading` และ `speed` จะไม่ถูกส่งเมื่ออุปกรณ์ไม่มีค่า แอปรอ acknowledgement จาก Socket.IO server ภายใน 5 วินาที

ปุ่ม **ติดตามอุปกรณ์** ส่ง event `tracking:subscribe`:

```json
{
  "deviceId": "truck-01"
}
```

## การทำงานเบื้องหลัง

background task ถูกประกาศใน `background-location.ts` และโหลดจาก root layout แอปจะ:

1. รับตำแหน่งล่าสุดจากระบบ
2. บันทึกตำแหน่งลง AsyncStorage
3. อ่านค่าการเชื่อมต่อที่บันทึกไว้
4. เชื่อมต่อ Socket.IO ผ่าน WebSocket และส่ง `location:update`
5. ตัดการเชื่อมต่อหลังได้รับ acknowledgement

ค่าปัจจุบันร้องขอพิกัดความแม่นยำสูงทุก 1 วินาทีหรือเมื่อเคลื่อนที่อย่างน้อย 1 เมตร ซึ่งอาจใช้แบตเตอรี่สูง ควรปรับ `timeInterval`, `distanceInterval` และ `accuracy` ให้เหมาะกับการใช้งานจริง

## สิทธิ์และข้อจำกัด

- Android ต้องอนุญาตทั้ง foreground และ background location
- iOS ต้องอนุญาตตำแหน่งแบบ **Always** เพื่อทำงานเบื้องหลัง
- หากผู้ใช้บังคับปิดแอป การติดตามตำแหน่งเบื้องหลังจะหยุด และพฤติกรรมบน Android อาจต่างกันตามผู้ผลิตอุปกรณ์
- ค่า permission และ background mode ถูกกำหนดผ่าน config plugin ใน `app.json`; เมื่อแก้ค่าเหล่านี้ต้องสร้าง native app ใหม่
- Android package name คือ `com.ahteenoi.track`

## โครงสร้างสำคัญ

```text
app/
├── _layout.tsx           # Root layout และโหลด background task
└── index.tsx             # หน้าหลัก การขอสิทธิ์ GPS และ Socket.IO client
background-location.ts    # งานติดตามและส่งตำแหน่งเบื้องหลัง
app.json                  # Expo และ native permission configuration
package.json              # dependencies และ scripts
```

## ตรวจสอบก่อนนำไปใช้งานจริง

- เปลี่ยน Server URL และ Device ID จากค่าทดสอบ
- ใช้ `https://` / `wss://` และระบบ authentication สำหรับเซิร์ฟเวอร์จริง
- ทดสอบ permission flow บน Android และ iOS จริง
- ประเมินความถี่ GPS และผลกระทบต่อแบตเตอรี่
- เพิ่มการจัดการข้อผิดพลาดและคิวส่งซ้ำเมื่อไม่มีเครือข่ายตามความต้องการของระบบ

## เอกสารอ้างอิง

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Location (SDK 54)](https://docs.expo.dev/versions/v54.0.0/sdk/location/)
- [Expo TaskManager (SDK 54)](https://docs.expo.dev/versions/v54.0.0/sdk/task-manager/)
- [Expo Router](https://docs.expo.dev/versions/v54.0.0/router/introduction/)
