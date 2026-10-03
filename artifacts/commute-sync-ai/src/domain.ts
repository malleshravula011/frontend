export type Role = 'Employee' | 'Driver' | 'Admin';
export type RideStatus = 'Open' | 'Requested' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled';
export type RequestStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Cancelled';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: string;
  home: string;
  work: string;
  phone: string;
  rating: number;
  trips: number;
  verified: boolean;
  vehicle?: string;
  plate?: string;
};

export type Ride = {
  id: string;
  driverId: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  seats: number;
  totalSeats: number;
  vehicle: string;
  plate: string;
  price: number;
  distance: number;
  detour: number;
  pickupPoints: string[];
  notes: string;
  status: RideStatus;
  phase?: string;
  passengers: string[];
  createdAt: string;
};

export type RideRequest = {
  id: string;
  rideId: string;
  passengerId: string;
  seats: number;
  pickup: string;
  status: RequestStatus;
  createdAt: string;
};

export type Notice = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type DemoIssue = {
  id: string;
  title: string;
  detail: string;
  rideId?: string;
  status: 'Open' | 'Reviewing' | 'Resolved';
  createdAt: string;
};

export type DemoData = {
  users: User[];
  rides: Ride[];
  requests: RideRequest[];
  notices: Notice[];
  issues: DemoIssue[];
  currentUserId: string;
  profile: {
    home: string;
    work: string;
    preferences: string[];
    accessibility: string;
    luggage: string;
    emergencyName: string;
    emergencyPhone: string;
    notifications: boolean;
    shareProfile: boolean;
    vehicle: string;
    plate: string;
    price: number;
  };
};

const day = new Date();
const today = day.toISOString().slice(0, 10);
const tomorrow = new Date(day.getTime() + 86400000).toISOString().slice(0, 10);

export const makeSeed = (): DemoData => ({
  users: [
    { id: 'u-employee', name: 'Ananya Rao', email: 'ananya@northstar.demo', role: 'Employee', team: 'Product Design', home: 'Kondapur', work: 'Hitech City', phone: '••• ••• 4182', rating: 4.9, trips: 18, verified: true },
    { id: 'u-driver', name: 'Rohan Mehta', email: 'rohan@northstar.demo', role: 'Driver', team: 'Engineering', home: 'Gachibowli', work: 'Hitech City', phone: '••• ••• 2064', rating: 4.8, trips: 42, verified: true, vehicle: 'Hyundai Creta', plate: 'TS 09 FA 2381' },
    { id: 'u-driver2', name: 'Kavya Reddy', email: 'kavya@northstar.demo', role: 'Driver', team: 'Finance', home: 'Madhapur', work: 'Hitech City', phone: '••• ••• 7841', rating: 4.7, trips: 31, verified: true, vehicle: 'Honda City', plate: 'TS 10 GK 5186' },
    { id: 'u-employee2', name: 'Arjun Nair', email: 'arjun@northstar.demo', role: 'Employee', team: 'People Ops', home: 'Kukatpally', work: 'Hitech City', phone: '••• ••• 6509', rating: 4.9, trips: 12, verified: true },
    { id: 'u-admin', name: 'Mira Shah', email: 'mira@northstar.demo', role: 'Admin', team: 'Workplace', home: 'Madhapur', work: 'Hitech City', phone: '••• ••• 1093', rating: 5, trips: 0, verified: true },
  ],
  rides: [
    { id: 'ride-101', driverId: 'u-driver', origin: 'Gachibowli', destination: 'Hitech City', date: today, time: '08:20', seats: 2, totalSeats: 3, vehicle: 'Hyundai Creta', plate: 'TS 09 FA 2381', price: 54, distance: 12.4, detour: 1.3, pickupPoints: ['Botanical Garden', 'Kondapur'], notes: 'Quiet ride, AC on, no smoking.', status: 'Open', passengers: [], createdAt: new Date().toISOString() },
    { id: 'ride-102', driverId: 'u-driver2', origin: 'Madhapur', destination: 'Hitech City', date: today, time: '08:45', seats: 1, totalSeats: 2, vehicle: 'Honda City', plate: 'TS 10 GK 5186', price: 42, distance: 7.8, detour: 0.8, pickupPoints: ['Ayyappa Society', 'Cyber Towers'], notes: 'Non-smoking, AC available, one small bag.', status: 'Open', passengers: [], createdAt: new Date().toISOString() },
    { id: 'ride-103', driverId: 'u-driver', origin: 'Kondapur', destination: 'Hitech City', date: tomorrow, time: '09:00', seats: 1, totalSeats: 3, vehicle: 'Hyundai Creta', plate: 'TS 09 FA 2381', price: 48, distance: 9.6, detour: 1.1, pickupPoints: ['Kondapur RTO'], notes: '', status: 'Open', passengers: [], createdAt: new Date().toISOString() },
    { id: 'ride-104', driverId: 'u-driver2', origin: 'Kukatpally', destination: 'Hitech City', date: tomorrow, time: '08:10', seats: 2, totalSeats: 3, vehicle: 'Honda City', plate: 'TS 10 GK 5186', price: 76, distance: 18.2, detour: 2.4, pickupPoints: ['JNTU Metro', 'Miyapur'], notes: 'Expressway route.', status: 'Open', passengers: [], createdAt: new Date().toISOString() },
  ],
  requests: [],
  notices: [
    { id: 'notice-welcome', userId: 'u-employee', title: 'Your commute is ready to share', body: 'There are 4 upcoming rides around Hitech City.', read: false, createdAt: new Date().toISOString() },
    { id: 'notice-driver', userId: 'u-driver', title: 'A smoother morning starts here', body: 'Your ride listing is visible to nearby colleagues.', read: false, createdAt: new Date().toISOString() },
    { id: 'notice-delay-sample', userId: 'u-employee', title: 'Simulated delay · alternate route', body: 'DEMO EVENT: A sample 12-minute delay was added to a Gachibowli → Hitech City commute. Consider the Madhapur corridor instead. This is not live traffic data.', read: false, createdAt: new Date().toISOString() },
  ],
  issues: [
    { id: 'issue-sample-01', title: 'Pickup point needs clearer landmark', detail: 'Sample report: add a recognizable meeting point near Kondapur RTO.', rideId: 'ride-103', status: 'Open', createdAt: new Date().toISOString() },
  ],
  currentUserId: 'u-employee',
  profile: { home: 'Kondapur', work: 'Hitech City', preferences: ['No smoking', 'AC preferred'], accessibility: 'No specific needs', luggage: 'Small bag', emergencyName: 'Vikram Rao', emergencyPhone: '+91 98••• ••214', notifications: true, shareProfile: true, vehicle: 'Hyundai Creta', plate: 'TS 09 FA 2381', price: 54 },
});

const STORAGE_KEY = 'commutesync-demo-v1';
export function loadDemo(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeSeed();
    const parsed = JSON.parse(raw) as DemoData;
    if (!parsed.users || !parsed.rides || !parsed.requests || !parsed.notices) return makeSeed();
    const defaults = makeSeed();
    const sampleDelayNotice = defaults.notices.find((notice) => notice.id === 'notice-delay-sample');
    return {
      ...defaults,
      ...parsed,
      notices: parsed.notices.some((notice) => notice.id === 'notice-delay-sample') || !sampleDelayNotice ? parsed.notices : [...parsed.notices, sampleDelayNotice],
      issues: Array.isArray(parsed.issues) ? parsed.issues : defaults.issues,
      profile: { ...defaults.profile, ...parsed.profile },
    };
  } catch {
    return makeSeed();
  }
}
export function saveDemo(data: DemoData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* Browser storage may be unavailable in private mode. */ }
}
export function resetDemo() {
  const seed = makeSeed();
  saveDemo(seed);
  return seed;
}