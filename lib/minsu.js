// 民宿管理系统 — 20间房，JSON文件存储
const fs = require("fs");
const path = require("path");
const DATA_FILE = path.join(__dirname, "..", "data", "minsu.json");

const DEFAULTS = {
  rooms: [
    { id:"101", type:"大床房", price:200 },
    { id:"102", type:"大床房", price:200 },
    { id:"103", type:"大床房", price:200 },
    { id:"201", type:"双床房", price:260 },
    { id:"202", type:"双床房", price:260 },
    { id:"203", type:"双床房", price:260 },
    { id:"301", type:"大床房", price:200 },
    { id:"302", type:"大床房", price:200 },
    { id:"303", type:"大床房", price:200 },
    { id:"401", type:"双床房", price:260 },
    { id:"402", type:"双床房", price:260 },
    { id:"403", type:"双床房", price:260 },
    { id:"501", type:"景观房", price:380 },
    { id:"502", type:"景观房", price:380 },
    { id:"503", type:"景观房", price:380 },
    { id:"601", type:"套房", price:480 },
    { id:"602", type:"套房", price:480 },
    { id:"701", type:"大床房", price:200 },
    { id:"702", type:"大床房", price:200 },
    { id:"703", type:"大床房", price:200 },
  ],
  records: [],
  bookings: [],
  revenues: [],
};

function read() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2), "utf8");
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function write(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

// 房间列表（含当前状态）
function getRooms() {
  const db = read();
  return db.rooms.map(r => {
    const active = db.records.find(e => e.roomId === r.id && e.status === "已入住");
    const booking = db.bookings.find(b => b.roomId === r.id && b.status !== "已取消");
    let status = "空闲";
    if (active) status = "已入住";
    else if (booking) status = "已预订";
    if (r.maintenance) status = "维修中";
    return { ...r, status, activeGuest: active ? active.guestName : null, bookingDate: booking ? booking.from : null };
  });
}

// 入住
function checkIn({ roomId, guestName, phone, idNumber, checkIn, checkOut, amount, payment, note }) {
  const db = read();
  const room = db.rooms.find(r => r.id === roomId);
  if (!room) return { error: "房间不存在" };
  const active = db.records.find(r => r.roomId === roomId && r.status === "已入住");
  if (active) return { error: "该房间已有客人入住" };
  const record = {
    id: Date.now(),
    roomId, guestName, phone, idNumber: idNumber || "",
    checkIn: checkIn || new Date().toISOString().slice(0, 10),
    checkOut, amount: parseInt(amount) || room.price,
    payment: payment || "到付", note: note || "",
    status: "已入住", createdAt: new Date().toISOString(),
  };
  db.records.push(record);
  write(db);
  return { ok: true, record };
}

// 退房
function checkOut(recordId) {
  const db = read();
  const record = db.records.find(r => r.id === recordId);
  if (!record) return { error: "记录不存在" };
  record.status = "已退房";
  record.checkOutTime = new Date().toISOString();
  // 收入记账
  db.revenues.push({
    id: Date.now(),
    roomId: record.roomId,
    guestName: record.guestName,
    amount: record.amount,
    payment: record.payment,
    date: new Date().toISOString().slice(0, 10),
    note: record.note,
  });
  write(db);
  return { ok: true, record };
}

// 预订
function addBooking({ roomId, guestName, phone, from, to, note }) {
  const db = read();
  const record = {
    id: Date.now(),
    roomId, guestName, phone, from, to, note: note || "",
    status: "已预订", createdAt: new Date().toISOString(),
  };
  db.bookings.push(record);
  write(db);
  return { ok: true, booking: record };
}

// 取消预订
function cancelBooking(bookingId) {
  const db = read();
  const b = db.bookings.find(b => b.id === bookingId);
  if (!b) return { error: "预订不存在" };
  b.status = "已取消";
  write(db);
  return { ok: true };
}

// 预订转入住
function bookingCheckIn(bookingId, extra = {}) {
  const db = read();
  const b = db.bookings.find(b => b.id === bookingId);
  if (!b) return { error: "预订不存在" };
  return checkIn({ roomId: b.roomId, guestName: b.guestName, phone: b.phone, checkIn: extra.checkIn || b.from, checkOut: extra.checkOut || b.to, amount: extra.amount, payment: extra.payment, note: b.note });
}

// 今日数据
function getToday() {
  const db = read();
  const today = new Date().toISOString().slice(0, 10);
  const active = db.records.filter(r => r.status === "已入住");
  const todayCheckIn = db.records.filter(r => r.checkIn === today);
  const todayCheckOut = db.records.filter(r => r.status === "已退房" && r.checkOutTime && r.checkOutTime.slice(0, 10) === today);
  const todayRevenue = db.revenues.filter(r => r.date === today).reduce((s, r) => s + r.amount, 0);
  const bookings = db.bookings.filter(b => b.status === "已预订");
  return { active: active.length, todayCheckIn: todayCheckIn.length, todayCheckOut: todayCheckOut.length, todayRevenue, bookingCount: bookings.length };
}

// 收入报表
function getRevenue(from, to) {
  const db = read();
  let revenues = db.revenues;
  if (from) revenues = revenues.filter(r => r.date >= from);
  if (to) revenues = revenues.filter(r => r.date <= to);
  const total = revenues.reduce((s, r) => s + r.amount, 0);
  return { total, count: revenues.length, items: revenues.sort((a, b) => b.date.localeCompare(a.date)) };
}

// 住宿记录
function getRecords(status, page = 1, limit = 50) {
  const db = read();
  let records = db.records;
  if (status) records = records.filter(r => r.status === status);
  records = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = records.length;
  const start = (page - 1) * limit;
  return { total, items: records.slice(start, start + limit) };
}

// 获取预订列表
function getBookings(status) {
  const db = read();
  let bookings = db.bookings;
  if (status) bookings = bookings.filter(b => b.status === status);
  return bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// 编辑房间价格/类型
function updateRoom(roomId, updates) {
  const db = read();
  const room = db.rooms.find(r => r.id === roomId);
  if (!room) return { error: "房间不存在" };
  if (updates.type) room.type = updates.type;
  if (updates.price) room.price = parseInt(updates.price);
  if (updates.maintenance !== undefined) room.maintenance = updates.maintenance;
  if (updates.newId && updates.newId !== roomId) {
    // rename room - update all references
    const oldId = room.id;
    db.rooms = db.rooms.map(r => r.id === oldId ? { ...r, id: updates.newId } : r);
    db.records = db.records.map(r => r.roomId === oldId ? { ...r, roomId: updates.newId } : r);
    db.bookings = db.bookings.map(r => r.roomId === oldId ? { ...r, roomId: updates.newId } : r);
    db.revenues = db.revenues.map(r => r.roomId === oldId ? { ...r, roomId: updates.newId } : r);
  }
  write(db);
  return { ok: true };
}

// 添加房间
function addRoom(id, type, price) {
  const db = read();
  if (db.rooms.find(r => r.id === id)) return { error: "房号已存在" };
  db.rooms.push({ id, type: type || "大床房", price: parseInt(price) || 200 });
  write(db);
  return { ok: true };
}

// 删除房间
function deleteRoom(roomId) {
  const db = read();
  const active = db.records.find(r => r.roomId === roomId && r.status === "已入住");
  if (active) return { error: "该房间有客人入住，无法删除" };
  db.rooms = db.rooms.filter(r => r.id !== roomId);
  db.records = db.records.filter(r => r.roomId !== roomId);
  db.bookings = db.bookings.filter(r => r.roomId !== roomId);
  write(db);
  return { ok: true };
}

module.exports = { getRooms, checkIn, checkOut, addBooking, cancelBooking, bookingCheckIn, getToday, getRevenue, getRecords, getBookings, updateRoom, addRoom, deleteRoom };
