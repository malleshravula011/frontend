import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import 'leaflet/dist/leaflet.css';
import {
  Activity, ArrowLeft, ArrowRight, Bell, BriefcaseBusiness,
  CalendarDays, CarFront, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Compass, Leaf,
  LogOut, MapPin, Menu, Navigation, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, Users, Wallet, X,
} from 'lucide-react';
import { type DemoData, type DemoIssue, type Notice, type Ride, type RideRequest, type RideStatus, type Role, loadDemo, resetDemo, saveDemo } from './domain';

type ToastItem = { id: number; text: string; kind?: 'success' | 'error' };
type SharedProps = { data: DemoData; update: (fn: (current: DemoData) => DemoData) => void; notify: (text: string, kind?: 'success' | 'error') => void };

const navEmployee = [
  { href: '/dashboard', label: 'Overview', icon: Activity },
  { href: '/rides', label: 'Find a ride', icon: Compass },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile & settings', icon: Settings2 },
];
const navDriver = [
  { href: '/driver', label: 'Driver overview', icon: Activity },
  { href: '/offer', label: 'Offer a ride', icon: Plus },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Vehicle & profile', icon: Settings2 },
];
const navAdmin = [
  { href: '/admin', label: 'Operations', icon: Activity },
  { href: '/rides', label: 'Ride directory', icon: Compass },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Settings', icon: Settings2 },
];
const routePlaces = ['Gachibowli', 'Hitech City', 'Madhapur', 'Kondapur', 'Kukatpally'];
const areaCoordinates: Record<string, [number, number]> = {
  Gachibowli: [17.4401, 78.3489],
  'Hitech City': [17.4435, 78.3772],
  Madhapur: [17.4483, 78.3915],
  Kondapur: [17.4611, 78.3564],
  Kukatpally: [17.4849, 78.4138],
};
const mapMarkerIcon = (kind: 'origin' | 'destination' | 'pickup') => L.divIcon({
  className: 'commute-marker-wrap',
  html: `<span class="commute-marker commute-marker-${kind}"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const money = (value: number) => `₹${Math.round(value)}`;
const statusTone = (status: string) => status === 'Completed' || status === 'Accepted' || status === 'Confirmed' ? 'green' : status === 'Cancelled' || status === 'Rejected' ? 'red' : status === 'In Progress' ? 'blue' : 'amber';
const latestRequest = (requests: RideRequest[], rideId: string, passengerId: string) => requests
  .filter((request) => request.rideId === rideId && request.passengerId === passengerId)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
function reconciledRideStatus(ride: Ride, requests: RideRequest[]): RideStatus {
  if (['In Progress', 'Completed', 'Cancelled'].includes(ride.status)) return ride.status;
  if (requests.some((request) => request.status === 'Accepted')) return 'Confirmed';
  if (requests.some((request) => request.status === 'Pending')) return 'Requested';
  return 'Open';
}
function latestRideRequests(requests: RideRequest[], rideId: string): RideRequest[] {
  const latestByPassenger = new Map<string, RideRequest>();
  for (const request of requests.filter((item) => item.rideId === rideId)) {
    const previous = latestByPassenger.get(request.passengerId);
    if (!previous || request.createdAt.localeCompare(previous.createdAt) > 0 || (request.createdAt === previous.createdAt && request.id.localeCompare(previous.id) > 0)) latestByPassenger.set(request.passengerId, request);
  }
  return [...latestByPassenger.values()];
}
function seatsUnreserved(ride: Ride, requests: RideRequest[]) {
  return Math.max(0, ride.seats - requests.filter((request) => request.rideId === ride.id && request.status === 'Pending').reduce((total, request) => total + request.seats, 0));
}
function preferenceMatches(ride: Ride, preference: string) {
  const notes = ride.notes.toLowerCase();
  if (preference === 'No smoking') return /no smok|non.smok|smoke.free/.test(notes);
  if (preference === 'AC preferred') return /ac|air conditioning/.test(notes);
  if (preference === 'Quiet ride') return /quiet/.test(notes);
  return true;
}

function illustrativePoint(area: string, index: number, count: number): [number, number] {
  const normalized = area.toLowerCase();
  const match = Object.entries(areaCoordinates).find(([name]) => normalized.includes(name.toLowerCase()));
  if (match) return match[1];
  const start = areaCoordinates.Gachibowli;
  const end = areaCoordinates['Hitech City'];
  const t = (index + 1) / (count + 1);
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
}

function IllustrativeMap({ ride }: { ride: Ride }) {
  const pickups = ride.pickupPoints.map((point, index) => ({ label: point, position: illustrativePoint(point, index, ride.pickupPoints.length) }));
  const route = [areaCoordinates[ride.origin] || illustrativePoint(ride.origin, 0, 1), ...pickups.map((point) => point.position), areaCoordinates[ride.destination] || illustrativePoint(ride.destination, 0, 1)];
  const bounds = L.latLngBounds(route.map((point) => L.latLng(point[0], point[1])));
  return <div className="relative h-[260px] sm:h-[315px]">
    <MapContainer className="commute-leaflet" bounds={bounds} scrollWheelZoom={false} zoomControl={false} attributionControl>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <Polyline positions={route} pathOptions={{ color: '#278360', weight: 4, dashArray: '7 8', opacity: 0.9 }} />
      <Marker position={route[0]} icon={mapMarkerIcon('origin')}><Popup>Origin area: {ride.origin}</Popup></Marker>
      {pickups.map((point, index) => <Marker key={`${point.label}-${index}`} position={point.position} icon={mapMarkerIcon('pickup')}><Popup>Illustrative pickup: {point.label}</Popup></Marker>)}
      <Marker position={route[route.length - 1]} icon={mapMarkerIcon('destination')}><Popup>Destination area: {ride.destination}</Popup></Marker>
    </MapContainer>
    <div className="absolute bottom-3 left-3 z-[500] rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">Illustrative area-to-area line · {ride.distance} km estimate · no GPS or road routing</div>
  </div>;
}

function App() {
  const [data, setData] = useState<DemoData>(() => loadDemo());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { saveDemo(data); }, [data]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === 'commutesync-demo-v1') setData(loadDemo()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => setToasts((all) => all.slice(1)), 3600);
    return () => window.clearTimeout(timer);
  }, [toasts]);
  const update = (fn: (current: DemoData) => DemoData) => setData((current) => fn(current));
  const notify = (text: string, kind: 'success' | 'error' = 'success') => setToasts((all) => [...all, { id: Date.now() + Math.random(), text, kind }]);
  const user = data.users.find((candidate) => candidate.id === data.currentUserId) || data.users[0];
  const shared = { data, update, notify };
  const onRole = (role: Role) => {
    const target = data.users.find((candidate) => candidate.role === role);
    if (target) update((current) => ({ ...current, currentUserId: target.id }));
    const targetPath = role === 'Driver' ? '/driver' : role === 'Admin' ? '/admin' : '/dashboard';
    setLocation(targetPath);
    setMobileOpen(false);
  };
  const reset = () => {
    if (!window.confirm('Reset all demo activity and restore the original sample data?')) return;
    setData(resetDemo());
    notify('Demo workspace restored to its starting state.');
    setLocation('/dashboard');
  };
  const publicPage = location === '/' || location === '/login';

  return (
    <div className="app-shell">
      {publicPage ? (
        <Switch>
          <Route path="/" component={() => <Landing onLogin={() => setLocation('/login')} />} />
          <Route path="/login" component={() => <Login onChoose={onRole} />} />
        </Switch>
      ) : (
        <div className="flex min-h-[100dvh]">
          <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex items-center justify-between px-6 pb-7 pt-6">
              <Link href="/dashboard" className="flex items-center gap-3 text-white no-underline">
                <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-emerald-500 text-white"><Navigation size={20} strokeWidth={2.5} /></div>
                <div><div className="brand-type text-[18px] font-extrabold leading-5">CommuteSync</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[.19em] text-emerald-300">Hyderabad</div></div>
              </Link>
              <button aria-label="Close menu" className="icon-button text-slate-300 lg:hidden" onClick={() => setMobileOpen(false)}><X size={18} /></button>
            </div>
            <div className="mx-5 mb-6 rounded-xl border border-white/10 bg-white/[.055] px-3 py-2.5">
              <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Demo mode</span><span className="text-[10px] text-slate-400">Local data</span></div>
              <p className="mb-0 mt-1.5 text-[11px] leading-4 text-slate-300">Fictional commute activity. No live tracking.</p>
            </div>
            <div className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Workspace</div>
            <nav className="flex-1 space-y-1 px-3">
              {(user.role === 'Driver' ? navDriver : user.role === 'Admin' ? navAdmin : navEmployee).map((item) => {
                const Icon = item.icon;
                const active = location === item.href || (item.href === '/rides' && location.startsWith('/rides/'));
                const unread = item.label === 'Notifications' && data.notices.filter((notice) => notice.userId === user.id && !notice.read).length;
                return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`side-link ${active ? 'active' : ''}`}><Icon size={17} /><span>{item.label}</span>{unread ? <span className="ml-auto rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{unread}</span> : null}</Link>;
              })}
            </nav>
            <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[.045] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white"><Leaf size={15} className="text-emerald-300" /> Small shifts add up</div>
              <p className="mb-3 mt-2 text-[11px] leading-4 text-slate-400">Shared commutes can trim cost and congestion. All impact figures are estimates.</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-emerald-400" /></div>
              <div className="mt-1.5 flex justify-between text-[9px] text-slate-500"><span>Community goal</span><span>68%</span></div>
            </div>
            <div className="border-t border-white/10 p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={user.name} />
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-white">{user.name}</div><div className="text-[10px] text-slate-400">{user.role} · demo</div></div>
                <button aria-label="Switch role" className="icon-button text-slate-400 hover:text-white" onClick={() => setLocation('/login')}><LogOut size={16} /></button>
              </div>
            </div>
          </aside>
          {mobileOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
          <div className="min-w-0 flex-1 lg:ml-[258px]">
            <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-slate-200/80 bg-[#f8fafc]/95 px-4 backdrop-blur md:px-8">
              <div className="flex items-center gap-3">
                <button aria-label="Open navigation" className="icon-button lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
                <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span>Workspace</span><span className="text-slate-300">/</span><span className="font-semibold text-slate-800">{titleFor(location, user.role)}</span></div>
                <div className="sm:hidden text-sm font-bold text-slate-800">{titleFor(location, user.role)}</div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="hidden rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-amber-800 md:inline-flex">Demo mode</span>
                <label className="role-select-wrap"><span className="hidden text-[10px] font-semibold text-slate-500 sm:inline">Viewing as</span><select aria-label="Switch demo role" value={user.role} onChange={(event) => onRole(event.target.value as Role)}><option value="Employee">Employee</option><option value="Driver">Driver</option><option value="Admin">Admin</option></select><ChevronDown size={13} /></label>
                <Link href="/notifications" aria-label="Notifications" className="relative icon-button"><Bell size={18} />{data.notices.some((notice) => notice.userId === user.id && !notice.read) && <span className="absolute right-[6px] top-[5px] h-2 w-2 rounded-full border-2 border-[#f8fafc] bg-emerald-500" />}</Link>
                <button aria-label="View profile" className="hidden sm:block" onClick={() => setLocation('/profile')}><Avatar name={user.name} small /></button>
              </div>
            </header>
            <main className="page-enter mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
              <Switch>
                <Route path="/dashboard">{user.role === 'Admin' ? <AdminPage {...shared} /> : user.role === 'Driver' ? <DriverPage {...shared} /> : <EmployeePage {...shared} />}</Route>
                <Route path="/rides"><RidesPage {...shared} /></Route>
                <Route path="/rides/:id"><RideDetails {...shared} /></Route>
                <Route path="/driver"><DriverPage {...shared} /></Route>
                <Route path="/offer"><OfferPage {...shared} /></Route>
                <Route path="/notifications"><NotificationsPage {...shared} /></Route>
                <Route path="/profile"><ProfilePage {...shared} onReset={reset} /></Route>
                <Route path="/admin"><AdminPage {...shared} /></Route>
                <Route><NotFound /></Route>
              </Switch>
            </main>
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check size={15} /></span><span className="flex-1 text-sm font-medium">{toast.text}</span><button aria-label="Dismiss notification" className="text-slate-400" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X size={15} /></button></div>)}
      </div>
    </div>
  );
}

function titleFor(path: string, role: Role) {
  if (path === '/dashboard') return role === 'Driver' ? 'Driver overview' : role === 'Admin' ? 'Operations' : 'Your commute';
  if (path === '/driver') return 'Driver overview';
  if (path === '/offer') return 'Offer a ride';
  if (path === '/rides') return role === 'Admin' ? 'Ride directory' : 'Find a ride';
  if (path.startsWith('/rides/')) return 'Ride details';
  if (path === '/notifications') return 'Notifications';
  if (path === '/profile') return 'Profile & settings';
  if (path === '/admin') return 'Operations';
  return 'CommuteSync';
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`grid shrink-0 place-items-center rounded-full bg-[#dcece7] font-bold text-[#245d4c] ${small ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs'}`}>{initials(name)}</span>;
}

function Landing({ onLogin }: { onLogin: () => void }) {
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f7faf8] text-[#202b3c]">
    <header className="mx-auto flex max-w-[1260px] items-center justify-between px-5 py-5 md:px-8">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#16314a] text-emerald-300"><Navigation size={20} /></div><div className="brand-type text-[19px] font-extrabold">CommuteSync<span className="ml-1 text-emerald-600">.</span></div></div>
      <nav className="hidden items-center gap-8 text-[13px] font-semibold text-slate-600 md:flex"><a href="#how">How it works</a><a href="#benefits">Why share</a><a href="#questions">Questions</a></nav>
      <div className="flex items-center gap-3"><button className="hidden text-sm font-bold text-slate-700 sm:block" onClick={onLogin}>Demo sign in</button><button className="button-primary px-4 py-2.5" onClick={onLogin}>Open demo <ArrowRight size={15} /></button></div>
    </header>
    <section className="relative mx-auto grid max-w-[1260px] items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-8 md:pb-28 md:pt-16">
      <div className="absolute -left-32 top-36 h-[370px] w-[370px] rounded-full bg-[#d9efe6]/50 blur-3xl" />
      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Hyderabad · Shared by design</div>
        <h1 className="brand-type max-w-[650px] text-[48px] font-extrabold leading-[1.02] tracking-[-.055em] text-[#17253a] sm:text-6xl lg:text-[72px]">Smarter Commutes.<br /><span className="text-[#21825d]">Shared Journeys.</span></h1>
        <p className="mt-6 max-w-[490px] text-[16px] leading-7 text-slate-600">Make the office run feel lighter. Find colleagues heading your way, split the ride, and keep every detail transparent.</p>
        <div className="mt-8 flex flex-wrap gap-3"><button onClick={onLogin} className="button-primary px-5 py-3">Find a ride <ArrowRight size={16} /></button><button onClick={onLogin} className="button-secondary px-5 py-3">Offer a ride <CarFront size={16} /></button></div>
        <div className="mt-10 flex items-center gap-4 border-t border-slate-200 pt-6">
          <div className="flex -space-x-2"><Avatar name="Ananya Rao" small /><Avatar name="Rohan Mehta" small /><Avatar name="Kavya Reddy" small /><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7faf8] bg-[#e8eaf4] text-[9px] font-bold text-slate-600">+84</span></div>
          <p className="m-0 text-xs leading-5 text-slate-600"><strong className="text-slate-800">Colleagues going your way.</strong><br />Demo community across Hyderabad</p>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-[540px]">
        <div className="absolute -right-10 -top-5 h-28 w-28 rounded-full border border-[#dceae4]" />
        <div className="relative rounded-[30px] border border-[#e4ece7] bg-[#eaf3ee] p-4 shadow-[0_28px_80px_rgba(45,88,68,.12)] sm:p-7">
          <div className="relative min-h-[370px] overflow-hidden rounded-[22px] border border-white/70 bg-[#f5f8f4]">
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(#c7d9ce 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <svg viewBox="0 0 520 380" className="absolute inset-0 h-full w-full" aria-label="Illustrative Hyderabad commute route">
              <path d="M62 285 C125 278 104 208 180 228 C244 245 236 154 298 176 C362 198 357 110 458 94" fill="none" stroke="#d5e6dd" strokeWidth="25" strokeLinecap="round" />
              <path d="M62 285 C125 278 104 208 180 228 C244 245 236 154 298 176 C362 198 357 110 458 94" fill="none" stroke="#25825d" strokeWidth="3" strokeDasharray="7 9" strokeLinecap="round" />
              <circle cx="62" cy="285" r="10" fill="#1e7e5c" stroke="white" strokeWidth="5" /><circle cx="458" cy="94" r="10" fill="#203851" stroke="white" strokeWidth="5" />
              <circle cx="180" cy="228" r="6" fill="#edb44b" stroke="white" strokeWidth="4" /><circle cx="298" cy="176" r="6" fill="#edb44b" stroke="white" strokeWidth="4" />
            </svg>
            <div className="absolute left-[5%] top-[76%] rounded-lg border border-white bg-white/95 px-2.5 py-2 shadow-sm"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Pickup</div><div className="text-[11px] font-bold">Kondapur</div></div>
            <div className="absolute right-[6%] top-[17%] rounded-lg border border-white bg-white/95 px-2.5 py-2 shadow-sm"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Destination</div><div className="text-[11px] font-bold">Hitech City</div></div>
            <div className="absolute left-[47%] top-[39%] grid h-11 w-11 place-items-center rounded-2xl bg-[#193550] text-emerald-300 shadow-lg"><CarFront size={22} /></div>
            <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-slate-500">Illustrative route · not live GPS</div>
            <div className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-800">12.4 km · approx.</div>
          </div>
          <div className="relative z-10 -mt-1 rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_15px_40px_rgba(34,55,74,.1)] sm:mx-5 sm:-mt-7 sm:p-5">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Avatar name="Rohan Mehta" /><div><div className="text-sm font-bold text-slate-800">Rohan Mehta</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"><span className="text-amber-500">★</span> 4.8 <span className="mx-1">·</span> Hyundai Creta</div></div></div><div className="rounded-lg bg-emerald-50 px-3 py-2 text-right"><div className="text-sm font-extrabold text-emerald-800">₹54</div><div className="text-[9px] text-emerald-700">per seat · estimate</div></div></div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]"><span className="font-semibold text-slate-600">08:20 · Gachibowli → Hitech City</span><span className="rounded-full bg-[#f1f5f8] px-2 py-1 font-semibold text-slate-500">2 seats open</span></div>
          </div>
        </div>
        <div className="absolute -left-5 top-[48%] hidden items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-lg sm:flex"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e6f4ec] text-emerald-700"><Leaf size={17} /></span><div><div className="text-xs font-bold text-slate-800">Shared, not tracked</div><div className="text-[10px] text-slate-500">Estimates shown up front</div></div></div>
      </div>
    </section>
    <section className="border-y border-slate-200/80 bg-white py-7"><div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-6 px-5 text-center md:grid-cols-4">{[['12.4 km', 'sample shared route'], ['₹42–₹76', 'estimated seat share'], ['5 areas', 'Hyderabad sample data'], ['0 live feeds', 'demo by design']].map(([value, label]) => <div key={label}><div className="brand-type text-2xl font-extrabold text-[#1f654c]">{value}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div></div>)}</div></section>
    <section id="how" className="mx-auto max-w-[1160px] px-5 py-20 md:px-8 md:py-24"><SectionIntro eyebrow="A better everyday route" title="Good commutes are shared." description="A simple, people-first way for coworkers to make the same journey together." /><div className="mt-12 grid gap-4 md:grid-cols-3">{[['01', 'Find your match', 'Choose where you are headed and see rides ranked with a clear explanation.', Search], ['02', 'Request your seat', 'Pickup, price and available seats are visible before you ask to join.', Users], ['03', 'Travel together', 'Follow each trip’s status updates. No location tracking, just clear coordination.', Navigation]].map(([n, heading, desc, Icon]) => { const IconComponent = Icon as typeof Search; return <article key={n as string} className="rounded-2xl border border-slate-200 bg-white p-6"><span className="text-[11px] font-bold tracking-[.15em] text-emerald-700">{n as string}</span><div className="my-6 grid h-11 w-11 place-items-center rounded-xl bg-[#e8f4ee] text-[#237a58]"><IconComponent size={20} /></div><h3 className="brand-type text-xl font-extrabold">{heading as string}</h3><p className="mb-0 mt-2 text-sm leading-6 text-slate-600">{desc as string}</p></article>; })}</div></section>
    <section id="benefits" className="bg-[#172c40] py-16 text-white md:py-20"><div className="mx-auto grid max-w-[1160px] gap-12 px-5 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-8"><div><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-300">Cost & impact, in the open</div><h2 className="brand-type mt-4 text-4xl font-extrabold leading-tight">Make room for a lighter ride.</h2><p className="mt-4 max-w-md text-sm leading-6 text-slate-300">Every estimate comes with assumptions. The demo uses illustrative fuel, toll and emissions values—not measured savings.</p><button className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-300" onClick={onLogin}>Explore the demo <ArrowRight size={15} /></button></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.07] p-5"><Wallet className="text-emerald-300" size={20} /><div className="mt-5 brand-type text-3xl font-extrabold">₹42–₹76</div><p className="mb-0 mt-1 text-xs text-slate-300">Sample shared seat contribution</p></div><div className="rounded-2xl border border-white/10 bg-white/[.07] p-5"><Leaf className="text-emerald-300" size={20} /><div className="mt-5 brand-type text-3xl font-extrabold">~1.8 kg</div><p className="mb-0 mt-1 text-xs text-slate-300">Illustrative CO₂ avoided per shared trip</p></div><div className="rounded-2xl border border-white/10 bg-white/[.07] p-5 sm:col-span-2"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-200">Estimate assumptions</span><span className="text-[9px] uppercase tracking-wider text-slate-400">Demo values</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-300"><span>Fuel ₹11/km</span><span>Shared distance</span><span>1.5 kg CO₂/trip</span></div></div></div></div></section>
    <section id="questions" className="mx-auto max-w-[920px] px-5 py-20 md:px-8"><SectionIntro eyebrow="Designed for a demo" title="Clear answers, before the ride." description="CommuteSync is a local-first hackathon prototype. Its sample people and commute details are fictional." /><div className="mt-9 space-y-3">{[['Is this connected to real GPS?', 'No. Route lines and distance are illustrative. There is no live location collection.'], ['How are ride matches ranked?', 'A transparent rule-based score considers route overlap, departure time, available seats and pickup detour.'], ['Do changes persist?', 'Yes. Demo activity is saved in this browser’s local storage and can be reset from settings.']].map(([q, a]) => <details key={q} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer list-none pr-6 text-sm font-bold text-slate-800">{q}<ChevronDown className="float-right" size={17} /></summary><p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{a}</p></details>)}</div></section>
    <section className="border-y border-slate-200 bg-[#eff5f1] py-16 md:py-20">
      <div className="mx-auto max-w-[1160px] px-5 md:px-8">
        <SectionIntro eyebrow="Fictional sample testimonials" title="A little less solo, a little more human." description="These fictional quotes are included for the hackathon demo and do not represent real users." />
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            ['“Seeing the pickup and contribution up front makes trying a shared ride feel easy.”', 'Nisha K.', 'Fictional · Product team'],
            ['“I already drive this way. Offering two spare seats feels like a simple win.”', 'Dev M.', 'Fictional · Engineering'],
            ['“The route explanation is refreshingly clear. I know why a ride appears in my list.”', 'Tara S.', 'Fictional · People operations'],
          ].map(([quote, name, label]) => <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm leading-6 text-slate-700">{quote}</div><div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4"><Avatar name={name} small /><div><div className="text-xs font-bold text-slate-800">{name}</div><div className="mt-0.5 text-[9px] text-slate-500">{label}</div></div></div></article>)}
        </div>
      </div>
    </section>
    <footer className="border-t border-slate-200 bg-white px-5 py-8"><div className="mx-auto flex max-w-[1160px] flex-col justify-between gap-3 text-xs text-slate-500 sm:flex-row"><span>© 2025 CommuteSync · Hyderabad demo prototype</span><span>Fictional data · Local browser storage · No live tracking</span></div></footer>
  </div>;
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="max-w-[570px]"><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">{eyebrow}</div><h2 className="brand-type mt-3 text-3xl font-extrabold tracking-tight text-[#17253a] md:text-4xl">{title}</h2><p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{description}</p></div>;
}

function Login({ onChoose }: { onChoose: (role: Role) => void }) {
  const [choice, setChoice] = useState<Role>('Employee');
  return <div className="flex min-h-[100dvh] bg-[#f4f8f5]">
    <div className="hidden w-[42%] flex-col justify-between bg-[#172c40] p-10 text-white lg:flex">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-emerald-500 text-white"><Navigation size={20} /></div><span className="brand-type text-xl font-extrabold">CommuteSync</span></div>
      <div><span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Hyderabad demo</span><h1 className="brand-type mt-7 max-w-md text-5xl font-extrabold leading-[1.05]">A better commute starts with a colleague.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">Switch roles any time to explore the full shared ride flow. Nothing leaves this browser.</p></div>
      <div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15} className="text-emerald-300" /> Fictional sample accounts · Local demo data</div>
    </div>
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px]">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><ArrowLeft size={15} /> Back to home</Link>
        <div className="mb-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-amber-800">Demo mode · No password required</div>
        <h2 className="brand-type mt-3 text-3xl font-extrabold text-[#17253a]">Choose your demo role</h2><p className="mt-2 text-sm text-slate-600">No account setup. Pick a view and jump straight in.</p>
        <div className="mt-7 space-y-3">{(['Employee', 'Driver', 'Admin'] as Role[]).map((role) => {
          const details = role === 'Employee' ? ['Ananya Rao', 'Search and request a seat'] : role === 'Driver' ? ['Rohan Mehta', 'Offer rides and manage requests'] : ['Mira Shah', 'Review demo operations'];
          return <button key={role} onClick={() => setChoice(role)} className={`role-card ${choice === role ? 'selected' : ''}`}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f3ee] text-emerald-800">{role === 'Employee' ? <BriefcaseBusiness size={19} /> : role === 'Driver' ? <CarFront size={20} /> : <ShieldCheck size={19} />}</span><span className="flex-1 text-left"><span className="block text-sm font-bold text-slate-800">{role === 'Employee' ? 'Employee / Passenger' : role}</span><span className="mt-1 block text-xs text-slate-500">{details[0]} · {details[1]}</span></span><span className={`radio-dot ${choice === role ? 'checked' : ''}`} /></button>;
        })}</div>
        <button className="button-primary mt-6 w-full justify-center py-3" onClick={() => onChoose(choice)}>Enter as {choice} <ArrowRight size={16} /></button>
        <p className="mt-4 text-center text-[10px] leading-5 text-slate-500">This prototype is not production-secure authentication. Your role choice is stored locally for this demo.</p>
      </div>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-emerald-700">{eyebrow}</div>}<h1 className="brand-type m-0 text-[28px] font-extrabold tracking-[-.04em] text-[#1a293d] md:text-[34px]">{title}</h1>{description && <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`soft-shadow rounded-2xl border border-slate-200/75 bg-white ${className}`}>{children}</section>;
}

function Stat({ label, value, sub, icon: Icon, tone = 'green' }: { label: string; value: string; sub: string; icon: typeof Activity; tone?: string }) {
  return <Card className="p-4 sm:p-5"><div className="flex items-start justify-between"><div className="text-xs font-semibold text-slate-500">{label}</div><span className={`grid h-9 w-9 place-items-center rounded-xl ${tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon size={17} /></span></div><div className="brand-type mt-2 text-[26px] font-extrabold tracking-tight text-slate-800">{value}</div><div className="mt-1 text-[10px] text-slate-500">{sub}</div></Card>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${statusTone(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function EmployeePage({ data, update, notify }: SharedProps) {
  const [, setLocation] = useLocation();
  const user = data.users.find((candidate) => candidate.id === data.currentUserId)!;
  const myRequests = data.rides.map((ride) => latestRequest(data.requests, ride.id, user.id)).filter((request): request is RideRequest => Boolean(request));
  const nextRides = data.rides.filter((ride) => myRequests.some((request) => request.rideId === ride.id && (request.status === 'Accepted' || request.status === 'Pending')) && ride.status !== 'Cancelled' && ride.status !== 'Completed');
  const openRides = data.rides.filter((ride) => ride.status === 'Open' || ride.status === 'Requested');
  const completedRideIds = [...new Set(myRequests.filter((request) => request.status === 'Accepted' && data.rides.find((ride) => ride.id === request.rideId)?.status === 'Completed').map((request) => request.rideId))];
  const rideHistory = myRequests
    .filter((request) => ['Accepted', 'Cancelled'].includes(request.status))
    .map((request) => ({ request, ride: data.rides.find((item) => item.id === request.rideId) }))
    .filter((item): item is { request: RideRequest; ride: Ride } => Boolean(item.ride && ['Completed', 'Cancelled'].includes(item.ride.status)))
    .sort((a, b) => b.ride.date.localeCompare(a.ride.date) || b.ride.time.localeCompare(a.ride.time));
  const completedCount = completedRideIds.length;
  const sharedKm = completedCount * 12.4;
  const recommendations = [...openRides].sort((a, b) => matchScore(b, user.home, user.work, '08:30', 1, [], seatsUnreserved(b, data.requests)) - matchScore(a, user.home, user.work, '08:30', 1, [], seatsUnreserved(a, data.requests))).slice(0, 2);
  const savingsHistory = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const trips = completedRideIds.filter((rideId) => data.rides.find((ride) => ride.id === rideId)?.date === key).length;
    return { day: date.toLocaleDateString('en-IN', { weekday: 'short' }), trips, savings: trips * 96 };
  });
  const [searchFrom, setSearchFrom] = useState(user.home);
  const [searchTo, setSearchTo] = useState(user.work);
  const [searchDate, setSearchDate] = useState('');
  const [searchTime, setSearchTime] = useState('08:30');
  const [timeWindow, setTimeWindow] = useState('30');
  const [searchSeats, setSearchSeats] = useState('1');
  const [searchPrefs, setSearchPrefs] = useState<string[]>(data.profile.preferences);
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ from: searchFrom, to: searchTo, time: searchTime, window: timeWindow, seats: searchSeats, prefs: searchPrefs.join('|') });
    if (searchDate) params.set('date', searchDate);
    setLocation(`/rides?${params.toString()}`);
  };
  const toggleSearchPref = (preference: string) => setSearchPrefs((current) => current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference]);
  return <>
    <PageHeading eyebrow={`Good morning, ${user.name.split(' ')[0]}`} title="Your next commute, simplified." description="See familiar faces going your way, then make the ride yours." action={<Link href="/rides" className="button-primary px-4 py-2.5">Find a ride <ArrowRight size={15} /></Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Upcoming rides" value={`${nextRides.length}`} sub="Your active requests & seats" icon={CalendarDays} /><Stat label="Estimated saved" value={money(completedCount * 96)} sub="Versus travelling solo · illustrative" icon={Wallet} tone="blue" /><Stat label="Shared distance" value={`${sharedKm.toFixed(1)} km`} sub="Completed demo trips" icon={Navigation} tone="amber" /><Stat label="CO₂ estimate" value={`${(completedCount * 1.8).toFixed(1)} kg`} sub="Illustrative, not measured" icon={Leaf} /></div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="m-0 text-sm font-bold text-slate-800">Your commute plan</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">A quick look at what’s moving</p></div><Link href="/rides" className="text-xs font-bold text-emerald-700">Browse rides <ArrowRight size={13} className="ml-1 inline" /></Link></div>
        {nextRides.length ? <div className="divide-y divide-slate-100">{nextRides.map((ride) => <RideMini key={ride.id} ride={ride} data={data} />)}</div> : <EmptyState icon={CarFront} title="No seat confirmed yet" description="Your next shared trip is just a search away." action={<Link href="/rides" className="button-primary px-3 py-2">Find a ride</Link>} />}
      </Card>
      <Card className="p-5">
        <div className="flex items-start justify-between"><div><div className="text-[10px] font-extrabold uppercase tracking-[.13em] text-emerald-700">Commute search</div><h2 className="brand-type mb-0 mt-2 text-xl font-extrabold">Where to?</h2></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin size={17} /></span></div>
        <p className="mt-2 text-xs text-slate-500">Set your commute details to find rides that fit.</p>
        <form onSubmit={submitSearch} className="mt-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2"><div className="field-wrap"><label htmlFor="dash-origin">Origin</label><select id="dash-origin" value={searchFrom} onChange={(event) => setSearchFrom(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div><div className="field-wrap"><label htmlFor="dash-destination">Destination</label><select id="dash-destination" value={searchTo} onChange={(event) => setSearchTo(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div></div>
          <div className="grid grid-cols-2 gap-2"><div className="field-wrap"><label htmlFor="dash-date">Travel date</label><input id="dash-date" type="date" value={searchDate} onChange={(event) => setSearchDate(event.target.value)} /></div><div className="field-wrap"><label htmlFor="dash-time">Departure around</label><input id="dash-time" type="time" required value={searchTime} onChange={(event) => setSearchTime(event.target.value)} /></div></div>
          <div className="grid grid-cols-2 gap-2"><div className="field-wrap"><label htmlFor="dash-window">Time window</label><select id="dash-window" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}><option value="15">±15 minutes</option><option value="30">±30 minutes</option><option value="45">±45 minutes</option><option value="60">±60 minutes</option></select></div><div className="field-wrap"><label htmlFor="dash-seats">Passenger seats</label><select id="dash-seats" value={searchSeats} onChange={(event) => setSearchSeats(event.target.value)}>{[1,2,3,4].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'seat' : 'seats'}</option>)}</select></div></div>
          <div><div className="mb-1.5 text-[10px] font-bold text-slate-600">Preferences <span className="font-normal text-slate-400">(ranking only)</span></div><div className="flex flex-wrap gap-1.5">{['No smoking', 'AC preferred', 'Quiet ride'].map((preference) => <button type="button" key={preference} onClick={() => toggleSearchPref(preference)} className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${searchPrefs.includes(preference) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>{searchPrefs.includes(preference) && <Check size={10} className="mr-1 inline" />}{preference}</button>)}</div></div>
          <button className="button-primary mt-1 w-full justify-center py-2.5">See matching rides <ArrowRight size={15} /></button>
        </form>
        <div className="mt-3 rounded-xl bg-[#f2f7f4] px-3 py-2.5 text-[10px] leading-4 text-slate-600"><Sparkles size={13} className="mr-1 inline text-emerald-700" /> Match scores use route, time, seats and optional preferences. Rules are transparent; no AI service is connected.</div>
      </Card>
    </div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
      <Card>
        <div className="flex items-center justify-between px-5 py-4"><div><h2 className="m-0 text-sm font-bold text-slate-800">Recommended for you</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Closest fit based on your saved commute</p></div><Link href="/rides" className="text-xs font-bold text-emerald-700">View all</Link></div>
        {recommendations.length ? <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">{recommendations.map((ride) => <RideCard key={ride.id} ride={ride} data={data} update={update} notify={notify} compact />)}</div> : <EmptyState title="No rides fit just now" description="Try a different time or route." />}
      </Card>
      <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="m-0 text-sm font-bold">Savings & trip history</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Illustrative weekly savings from completed rides</p></div><Leaf size={17} className="text-emerald-700" /></div><div className="mt-4 h-[150px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={savingsHistory} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9eef0" /><XAxis dataKey="day" tick={{ fontSize: 9, fill: '#8693a0' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#8693a0' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip formatter={(value, name) => [name === 'savings' ? `₹${value} estimated` : `${value} completed`, name === 'savings' ? 'Savings' : 'Trips']} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #e1e8e4' }} /><Bar dataKey="savings" name="Savings" fill="#278360" radius={[5, 5, 0, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div><div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-3"><div><div className="brand-type text-2xl font-extrabold text-slate-800">{(completedCount * 1.8).toFixed(1)} <span className="text-sm">kg</span></div><div className="text-[10px] text-slate-500">estimated CO₂ avoided · {completedCount} completed rides</div></div><span className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[9px] font-bold text-emerald-800">~₹96 / completed ride</span></div><div className="mt-3 text-[9px] leading-4 text-slate-500">Illustrative savings use a sample solo-travel baseline. No sensor or emissions data is collected.</div></Card>
    </div>
    <Card className="mt-6 overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="m-0 text-sm font-bold">Ride history</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Completed and cancelled trips from your demo commute</p></div>{rideHistory.length ? <div className="divide-y divide-slate-100">{rideHistory.slice(0, 5).map(({ ride }) => <RideMini key={ride.id} ride={ride} data={data} />)}</div> : <EmptyState icon={CalendarDays} title="No past rides yet" description="Completed or cancelled trips will appear here." />}</Card>
  </>;
}

function RideMini({ ride, data }: { ride: Ride; data: DemoData }) {
  const driver = data.users.find((user) => user.id === ride.driverId);
  return <Link href={`/rides/${ride.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50"><Avatar name={driver?.name || 'Driver'} small /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">{ride.origin} <ArrowRight size={12} className="text-slate-400" /> {ride.destination}<StatusBadge status={ride.status} /></div><div className="mt-1 text-[10px] text-slate-500">{formatDate(ride.date)} · {ride.time} · {driver?.name}</div></div><span className="text-xs font-bold text-slate-700">{money(ride.price)}</span></Link>;
}

function matchScore(ride: Ride, from: string, to: string, preferredTime: string, seatsNeeded = 1, preferences: string[] = [], availableSeats = ride.seats) {
  let score = 50;
  if (ride.origin.toLowerCase() === from.toLowerCase() || ride.pickupPoints.some((point) => point.toLowerCase().includes(from.toLowerCase()))) score += 18;
  else if (ride.origin.toLowerCase().includes(from.toLowerCase()) || from.toLowerCase().includes(ride.origin.toLowerCase())) score += 10;
  if (ride.destination.toLowerCase() === to.toLowerCase()) score += 18;
  else if (ride.destination.toLowerCase().includes(to.toLowerCase()) || to.toLowerCase().includes(ride.destination.toLowerCase())) score += 10;
  const [rh, rm] = ride.time.split(':').map(Number); const [ph, pm] = preferredTime.split(':').map(Number);
  const gap = Math.abs((rh * 60 + rm) - (ph * 60 + pm));
  score += gap <= 20 ? 10 : gap <= 45 ? 6 : 2;
  score += availableSeats >= seatsNeeded ? 8 : -30;
  score -= Math.min(ride.detour * 2, 8);
  score += preferences.filter((preference) => preferenceMatches(ride, preference)).length * 3;
  return Math.max(55, Math.min(98, Math.round(score)));
}

function RidesPage({ data, update, notify }: SharedProps) {
  const user = data.users.find((candidate) => candidate.id === data.currentUserId)!;
  const initialSearch = useMemo(() => new URLSearchParams(window.location.search), []);
  const [from, setFrom] = useState(initialSearch.get('from') || user.home);
  const [to, setTo] = useState(initialSearch.get('to') || user.work);
  const [date, setDate] = useState(initialSearch.get('date') || '');
  const [time, setTime] = useState(initialSearch.get('time') || '08:30');
  const [timeWindow, setTimeWindow] = useState(initialSearch.get('window') || '30');
  const [maxPrice, setMaxPrice] = useState('200');
  const [maxDetour, setMaxDetour] = useState('5');
  const [requestedSeats, setRequestedSeats] = useState(initialSearch.get('seats') || '1');
  const [preferences, setPreferences] = useState<string[]>(initialSearch.has('prefs') ? initialSearch.get('prefs')?.split('|').filter(Boolean) || [] : data.profile.preferences);
  const [vehicle, setVehicle] = useState('Any vehicle');
  const [sort, setSort] = useState('best');
  const [showFilters, setShowFilters] = useState(false);
  const [searchActive, setSearchActive] = useState(initialSearch.has('from'));
  const ownRequest = (rideId: string) => latestRequest(data.requests, rideId, user.id);
  const timeGap = (departure: string) => Math.abs((Number(departure.slice(0, 2)) * 60 + Number(departure.slice(3))) - (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))));
  const matches = useMemo(() => data.rides.filter((ride) => {
    if (['Cancelled', 'Completed', 'In Progress'].includes(ride.status) || ride.driverId === user.id) return false;
    if (date && ride.date !== date) return false;
    if (Number(maxPrice) && ride.price > Number(maxPrice)) return false;
    if (ride.detour > Number(maxDetour || 99)) return false;
    if (seatsUnreserved(ride, data.requests) < Number(requestedSeats)) return false;
    if (vehicle !== 'Any vehicle' && !ride.vehicle.toLowerCase().includes(vehicle.toLowerCase())) return false;
    if (!preferences.every((preference) => preferenceMatches(ride, preference))) return false;
    if (searchActive && timeGap(ride.time) > Number(timeWindow)) return false;
    const pickupFits = ride.origin.toLowerCase() === from.toLowerCase() || ride.pickupPoints.some((point) => point.toLowerCase().includes(from.toLowerCase()));
    const destinationFits = ride.destination.toLowerCase() === to.toLowerCase();
    return !searchActive || (pickupFits && destinationFits);
  }), [data.rides, data.requests, user.id, date, maxPrice, maxDetour, requestedSeats, vehicle, searchActive, from, to, time, timeWindow, preferences]);
  const sorted = [...matches].sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'time' ? a.time.localeCompare(b.time) : matchScore(b, from, to, time, Number(requestedSeats), preferences, seatsUnreserved(b, data.requests)) - matchScore(a, from, to, time, Number(requestedSeats), preferences, seatsUnreserved(a, data.requests)));
  return <>
    <PageHeading eyebrow="Find your way together" title="Rides around your route" description="Compare pickup points, seat cost and detour before you request. Every match score has a plain-language explanation." />
    <Card className="mb-5 p-4 md:p-5">
      <form onSubmit={(event) => { event.preventDefault(); setSearchActive(true); }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_130px_auto]">
        <div className="field-wrap"><label htmlFor="search-origin">From</label><select id="search-origin" value={from} onChange={(event) => setFrom(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div>
        <div className="field-wrap"><label htmlFor="search-destination">To</label><select id="search-destination" value={to} onChange={(event) => setTo(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div>
        <div className="field-wrap"><label htmlFor="search-date">Travel date</label><input id="search-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="field-wrap"><label htmlFor="search-time">Around</label><input id="search-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div>
        <div className="field-wrap"><label htmlFor="search-window">Window</label><select id="search-window" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}><option value="15">±15 min</option><option value="30">±30 min</option><option value="45">±45 min</option><option value="60">±60 min</option></select></div>
        <button className="button-primary justify-center px-4 py-2.5 sm:col-span-2 xl:col-span-1"><Search size={15} /> Search rides</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button className="text-xs font-bold text-slate-600" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={14} className="mr-1.5 inline" /> {showFilters ? 'Hide filters' : 'Filters'} {showFilters ? <ChevronDown className="ml-1 inline rotate-180" size={13} /> : null}</button>
        <div className="flex items-center gap-2 text-[10px] text-slate-500"><span>Sort</span><select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700" value={sort} onChange={(event) => setSort(event.target.value)}><option value="best">Best match</option><option value="time">Departure time</option><option value="price">Lowest price</option></select></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="mr-1 text-[10px] font-bold text-slate-600">Preference filters <span className="font-normal text-slate-400">(based on ride notes)</span></span>{['No smoking', 'AC preferred', 'Quiet ride'].map((preference) => <button type="button" key={preference} onClick={() => setPreferences((current) => current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference])} className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${preferences.includes(preference) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>{preferences.includes(preference) && <Check size={10} className="mr-1 inline" />}{preference}</button>)}</div>
      {showFilters && <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4"><div className="field-wrap"><label>Max seat cost</label><input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></div><div className="field-wrap"><label>Max detour (km)</label><input type="number" min="0" step=".5" value={maxDetour} onChange={(event) => setMaxDetour(event.target.value)} /></div><div className="field-wrap"><label>Seats to request</label><select value={requestedSeats} onChange={(event) => setRequestedSeats(event.target.value)}>{[1,2,3,4].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'seat' : 'seats'}</option>)}</select></div><div className="field-wrap"><label>Vehicle</label><select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option>Any vehicle</option><option>Hyundai</option><option>Honda</option><option>Sedan</option><option>SUV</option></select></div></div>}
    </Card>
    <div className="mb-4 flex items-center justify-between"><div className="text-sm font-bold text-slate-800">{sorted.length} rides to consider</div><span className="flex items-center gap-1 text-[10px] text-slate-500"><Sparkles size={12} className="text-emerald-700" /> Rule-based match · illustrative route only</span></div>
    {sorted.length ? <div className="grid gap-4 xl:grid-cols-2">{sorted.map((ride) => <RideCard key={ride.id} ride={ride} data={data} update={update} notify={notify} score={matchScore(ride, from, to, time, Number(requestedSeats), preferences, seatsUnreserved(ride, data.requests))} requestedSeats={Number(requestedSeats)} searchFrom={from} searchTo={to} searchTime={time} preferences={preferences} existingRequest={ownRequest(ride.id)} />)}</div> : <EmptyState icon={Search} title="No rides fit those filters" description="Try broadening the route, time window, seat count or maximum detour." action={<button onClick={() => { setDate(''); setMaxPrice('200'); setMaxDetour('5'); setRequestedSeats('1'); setVehicle('Any vehicle'); setPreferences([]); setSearchActive(false); }} className="button-secondary px-3 py-2">Clear filters</button>} />}
    <div className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-3 text-[10px] leading-5 text-slate-500"><strong className="text-slate-700">How matches are scored:</strong> route origin/pickup fit and destination fit, departure proximity within your selected time window, enough available seats, optional preference keywords, and a small detour penalty. Scores are transparent demo rules—not an AI prediction. Routes and distances are illustrative; there is no GPS feed.</div>
  </>;
}

function RideCard({ ride, data, update, notify, score, existingRequest, compact = false, requestedSeats = 1, searchFrom, searchTo, searchTime, preferences = [] }: SharedProps & { ride: Ride; score?: number; existingRequest?: RideRequest; compact?: boolean; requestedSeats?: number; searchFrom?: string; searchTo?: string; searchTime?: string; preferences?: string[] }) {
  const driver = data.users.find((candidate) => candidate.id === ride.driverId);
  const user = data.users.find((candidate) => candidate.id === data.currentUserId)!;
  const request = existingRequest ?? latestRequest(data.requests, ride.id, user.id);
  const requestSeat = () => {
    if (ride.driverId === user.id || user.role !== 'Employee') { notify('Seat requests are available from the employee demo role.', 'error'); return; }
    if (!['Open', 'Requested', 'Confirmed'].includes(ride.status)) { notify('This trip is no longer accepting seat requests.', 'error'); return; }
    if (seatsUnreserved(ride, data.requests) < requestedSeats) { notify('There are not enough seats remaining for that request.', 'error'); return; }
    if (request && ['Pending', 'Accepted'].includes(request.status)) { notify('You already have an active request for this ride.', 'error'); return; }
    const newRequest: RideRequest = { id: `req-${Date.now()}`, rideId: ride.id, passengerId: user.id, seats: requestedSeats, pickup: ride.pickupPoints[0] || ride.origin, status: 'Pending', createdAt: new Date().toISOString() };
    const notice: Notice = { id: `notice-${Date.now()}`, userId: ride.driverId, title: 'New seat request', body: `${user.name} would like to join your ${ride.origin} to ${ride.destination}.`, read: false, createdAt: new Date().toISOString() };
    update((current) => {
      const requests = [...current.requests, newRequest];
      return { ...current, requests, rides: current.rides.map((item) => item.id === ride.id ? { ...item, status: reconciledRideStatus(item, requests) } : item), notices: [notice, ...current.notices] };
    });
    notify('Request sent. The driver can now review it.');
  };
  const cancelRequest = () => {
    if (!request || !window.confirm('Cancel your request for this seat?')) return;
    if (ride.status === 'In Progress' || ['Cancelled', 'Completed'].includes(ride.status)) { notify('Seats cannot be cancelled after the trip has started.', 'error'); return; }
    update((current) => {
      const requests = current.requests.map((item) => item.id === request.id ? { ...item, status: 'Cancelled' as const } : item);
      const isAccepted = request.status === 'Accepted';
      return {
        ...current,
        requests,
        rides: current.rides.map((item) => item.id === ride.id ? {
          ...item,
          seats: isAccepted ? Math.min(item.totalSeats, item.seats + request.seats) : item.seats,
          passengers: isAccepted ? item.passengers.filter((passengerId) => passengerId !== user.id) : item.passengers,
          status: reconciledRideStatus(item, requests),
        } : item),
      };
    });
    notify(request.status === 'Accepted' ? 'Your confirmed seat was cancelled and returned to availability.' : 'Your seat request was cancelled.');
  };
  const canRequest = user.role === 'Employee' && ['Open', 'Requested', 'Confirmed'].includes(ride.status) && seatsUnreserved(ride, data.requests) >= requestedSeats;
  const detailsHref = `/rides/${ride.id}?seats=${requestedSeats}`;
  const openSeats = seatsUnreserved(ride, data.requests);
  const reasonText = matchReasons(ride, searchFrom || user.home, searchTo || user.work, searchTime || ride.time, requestedSeats, preferences, openSeats);
  return <article className={`rounded-2xl border border-slate-200 bg-white p-4 ${compact ? '' : 'soft-shadow p-5'}`}>
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Avatar name={driver?.name || 'Driver'} small /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">{driver?.name || 'Demo driver'} {driver?.verified && <ShieldCheck size={13} className="text-emerald-700" />}<span className="text-[10px] font-medium text-slate-500">★ {driver?.rating || '4.8'} · {driver?.trips || 0} trips</span></div><div className="mt-1 text-[10px] text-slate-500">{ride.vehicle} <span className="mx-1">·</span>{ride.plate}</div></div></div><StatusBadge status={ride.status} /></div>
    <div className="my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-[#f6f8fa] px-3 py-3"><div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pickup</div><div className="mt-1 text-xs font-bold text-slate-800">{ride.origin}</div></div><div className="flex flex-col items-center text-emerald-700"><div className="h-1.5 w-1.5 rounded-full bg-emerald-600" /><div className="my-1 h-5 w-px border-l border-dashed border-emerald-400" /><MapPin size={13} /></div><div className="text-right"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Drop-off</div><div className="mt-1 text-xs font-bold text-slate-800">{ride.destination}</div></div></div>
    <div className="grid grid-cols-2 gap-y-3 text-[10px] sm:grid-cols-4"><MiniInfo icon={Clock3} label="Departure" value={`${formatDate(ride.date)} · ${ride.time}`} /><MiniInfo icon={Users} label="Seats available" value={`${openSeats} of ${ride.totalSeats}`} /><MiniInfo icon={Navigation} label="Distance" value={`${ride.distance} km · approx.`} /><MiniInfo icon={Wallet} label="Per passenger" value={`${money(ride.price)} est.`} /></div>
    <div className="mt-3 rounded-lg border border-emerald-100 bg-[#f4faf6] px-3 py-2"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-emerald-900">Why this match</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-emerald-800">{score ?? 86}% fit</span></div><p className="mb-0 mt-1 text-[10px] leading-4 text-emerald-900/75">{reasonText}</p></div>
    {!compact && <div className="mt-3 flex flex-wrap gap-1.5">{ride.pickupPoints.map((point) => <span key={point} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{point}</span>)}<span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{ride.detour} km detour</span></div>}
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><div className="text-[10px] text-slate-500">Illustrative route · no live GPS</div><div className="flex gap-2"><Link href={detailsHref} className="button-secondary px-3 py-2 text-xs">Details</Link>{request?.status === 'Pending' ? <button className="button-danger px-3 py-2 text-xs" onClick={cancelRequest}>Cancel request</button> : request?.status === 'Accepted' ? <button className="button-danger px-3 py-2 text-xs" disabled={['In Progress','Cancelled','Completed'].includes(ride.status)} onClick={cancelRequest}>Cancel seat</button> : <button className="button-primary px-3 py-2 text-xs" disabled={!canRequest} onClick={requestSeat}>{canRequest ? request?.status === 'Rejected' || request?.status === 'Cancelled' ? 'Request again' : `Request ${requestedSeats} seat${requestedSeats === 1 ? '' : 's'}` : ride.status === 'In Progress' ? 'Trip in progress' : ride.seats < requestedSeats ? 'Not enough seats' : 'Unavailable'} <ArrowRight size={13} /></button>}</div></div>
  </article>;
}

function matchReasons(ride: Ride, home: string, work: string, preferredTime: string, seatsNeeded: number, preferences: string[], availableSeats: number) {
  const bits: string[] = [];
  bits.push(ride.origin.toLowerCase().includes(home.toLowerCase()) || ride.pickupPoints.some((point) => point.toLowerCase().includes(home.toLowerCase())) ? 'pickup is close to your saved area' : `departs from ${ride.origin}`);
  bits.push(ride.destination.toLowerCase().includes(work.toLowerCase()) ? 'heads to your work area' : `ends near ${ride.destination}`);
  const diff = Math.abs(Number(ride.time.slice(0, 2)) * 60 + Number(ride.time.slice(3)) - (Number(preferredTime.slice(0, 2)) * 60 + Number(preferredTime.slice(3))));
  bits.push(`${availableSeats} seats open for your ${seatsNeeded}-seat request`);
  if (diff < 40) bits.push('departure is near your preferred time');
  const matchedPrefs = preferences.filter((preference) => preferenceMatches(ride, preference));
  const preferenceCopy = preferences.length ? ` Listing notes ${matchedPrefs.length ? `match ${matchedPrefs.join(' and ').toLowerCase()}` : 'do not confirm the selected preferences'}; preferences are sample disclosures, not guarantees.` : '';
  return `${bits.slice(0, 3).join(' and ')}${ride.detour <= 1.5 ? ', with a short estimated detour.' : `, with an estimated ${ride.detour} km detour.`}${preferenceCopy}`;
}

function MiniInfo({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="flex items-start gap-1.5"><Icon size={13} className="mt-0.5 shrink-0 text-slate-400" /><div><div className="text-[9px] text-slate-400">{label}</div><div className="mt-0.5 font-semibold text-slate-700">{value}</div></div></div>;
}

function RideDetails({ data, update, notify }: SharedProps) {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ride = data.rides.find((item) => item.id === params.id);
  const selectedSeats = Math.max(1, Number(new URLSearchParams(window.location.search).get('seats') || 1));
  if (!ride) return <EmptyState icon={CarFront} title="Ride not found" description="This trip may have been removed from the demo workspace." action={<Link href="/rides" className="button-primary px-3 py-2">Back to rides</Link>} />;
  const driver = data.users.find((person) => person.id === ride.driverId);
  const currentUser = data.users.find((person) => person.id === data.currentUserId)!;
  const requests = latestRideRequests(data.requests, ride.id);
  const mine = latestRequest(requests, ride.id, currentUser.id);
  const driverActions = currentUser.id === ride.driverId;
  const changeStatus = (status: RideStatus, phase?: string) => {
    const valid: Record<RideStatus, RideStatus[]> = { Open: ['Cancelled', 'Requested'], Requested: ['Confirmed', 'Cancelled', 'Open'], Confirmed: ['In Progress', 'Cancelled'], 'In Progress': ['Completed', 'Cancelled'], Completed: [], Cancelled: [] };
    if (status !== ride.status && !valid[ride.status].includes(status)) { notify(`Cannot move a ${ride.status} ride to ${status}.`, 'error'); return; }
    if (status === 'Cancelled' && !window.confirm('Cancel this trip? All passengers will be notified.')) return;
    update((current) => {
      const passengerIds = current.requests.filter((request) => request.rideId === ride.id && ['Accepted', 'Pending'].includes(request.status)).map((request) => request.passengerId);
      const recipients = [...new Set([ride.driverId, ...passengerIds])];
      const notices = recipients.filter((id) => id !== current.currentUserId).map((id) => ({ id: `notice-${Date.now()}-${id}`, userId: id, title: `Ride ${status.toLowerCase()}`, body: `${ride.origin} to ${ride.destination} is now ${status.toLowerCase()}${phase ? ` — ${phase.toLowerCase()}` : ''}.`, read: false, createdAt: new Date().toISOString() }));
      const updatedRequests = status === 'Cancelled'
        ? current.requests.map((request) => request.rideId === ride.id && ['Accepted', 'Pending'].includes(request.status) ? { ...request, status: 'Cancelled' as const } : request)
        : current.requests;
      return { ...current, requests: updatedRequests, rides: current.rides.map((item) => item.id === ride.id ? { ...item, status, phase: phase || item.phase } : item), notices: [...notices, ...current.notices] };
    });
    notify(status === 'In Progress' ? (phase || 'Trip started') : `Trip status updated to ${status}.`);
  };
  const cancelMine = () => {
    if (!mine || !window.confirm(mine.status === 'Accepted' ? 'Cancel your confirmed seat?' : 'Cancel your pending seat request?')) return;
    if (ride.status === 'In Progress' || ['Cancelled', 'Completed'].includes(ride.status)) { notify('A seat cannot be cancelled after this trip has started.', 'error'); return; }
    update((current) => {
      const requests = current.requests.map((item) => item.id === mine.id ? { ...item, status: 'Cancelled' as const } : item);
      return {
        ...current,
        requests,
        rides: current.rides.map((item) => item.id === ride.id ? {
          ...item,
          seats: mine.status === 'Accepted' ? Math.min(item.totalSeats, item.seats + mine.seats) : item.seats,
          passengers: mine.status === 'Accepted' ? item.passengers.filter((passengerId) => passengerId !== currentUser.id) : item.passengers,
          status: reconciledRideStatus(item, requests),
        } : item),
      };
    });
    notify(mine.status === 'Accepted' ? 'Your confirmed seat was cancelled and returned to availability.' : 'Seat request cancelled.');
  };
  const requestSeat = () => {
    if (currentUser.role !== 'Employee' || !['Open', 'Requested', 'Confirmed'].includes(ride.status)) { notify('This ride is not accepting a request.', 'error'); return; }
    if (mine && ['Pending', 'Accepted'].includes(mine.status)) { notify('You already have an active request for this ride.', 'error'); return; }
    const pendingSeats = requests.filter((request) => request.status === 'Pending').reduce((total, request) => total + request.seats, 0);
    if (ride.seats - pendingSeats < selectedSeats) { notify('There are not enough seats remaining for your request.', 'error'); return; }
    const request: RideRequest = { id: `req-${Date.now()}`, rideId: ride.id, passengerId: currentUser.id, seats: selectedSeats, pickup: ride.pickupPoints[0] || ride.origin, status: 'Pending', createdAt: new Date().toISOString() };
    const notice: Notice = { id: `notice-${Date.now()}`, userId: ride.driverId, title: 'New seat request', body: `${currentUser.name} would like to join your ${ride.origin} to ${ride.destination}.`, read: false, createdAt: new Date().toISOString() };
    update((current) => {
      const allRequests = [...current.requests, request];
      return { ...current, requests: allRequests, rides: current.rides.map((item) => item.id === ride.id ? { ...item, status: reconciledRideStatus(item, allRequests) } : item), notices: [notice, ...current.notices] };
    });
    notify('Request sent. The driver can now review it.');
  };
  const milestones = ['Open', 'Requested', 'Confirmed', 'In Progress', 'Completed'];
  const currentIndex = ride.status === 'Cancelled' ? -1 : milestones.indexOf(ride.status);
  return <>
    <Link href={currentUser.role === 'Driver' ? '/driver' : '/rides'} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft size={14} /> Back to {currentUser.role === 'Driver' ? 'driver overview' : 'rides'}</Link>
    <PageHeading eyebrow="Shared trip · Illustrative route" title={`${ride.origin} to ${ride.destination}`} description={`${formatDate(ride.date)} · Departure at ${ride.time} · ${ride.distance} km estimated distance`} action={<StatusBadge status={ride.status} />} />
    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <IllustrativeMap ride={ride} />
          <div className="grid gap-4 p-5 sm:grid-cols-3"><div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pickup area</div><div className="mt-1 text-sm font-bold text-slate-800">{ride.origin}</div><div className="mt-1 text-[10px] text-slate-500">{ride.pickupPoints.join(' · ') || 'Driver pickup'}</div></div><div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Drop-off</div><div className="mt-1 text-sm font-bold text-slate-800">{ride.destination}</div><div className="mt-1 text-[10px] text-slate-500">Office area</div></div><div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Time & seats</div><div className="mt-1 text-sm font-bold text-slate-800">{ride.time} · {ride.seats} available</div><div className="mt-1 text-[10px] text-slate-500">{ride.vehicle}</div></div></div>
        </Card>
        <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="m-0 text-sm font-bold">Trip status</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Updates are shared across demo roles</p></div><Activity size={17} className="text-emerald-700" /></div><div className="mt-6 grid grid-cols-5">{milestones.map((step, index) => <div key={step} className="relative flex flex-col items-center text-center"><div className={`z-10 grid h-7 w-7 place-items-center rounded-full border-2 ${currentIndex >= index ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-400'}`}>{currentIndex > index ? <Check size={13} /> : <span className="text-[9px] font-bold">{index + 1}</span>}</div>{index < milestones.length - 1 && <div className={`absolute left-1/2 top-3.5 h-[2px] w-full ${currentIndex > index ? 'bg-emerald-500' : 'bg-slate-200'}`} /> }<span className={`mt-2 text-[8px] font-semibold sm:text-[10px] ${currentIndex >= index ? 'text-emerald-800' : 'text-slate-400'}`}>{step}</span></div>)}</div>{ride.status === 'Cancelled' && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">This trip was cancelled.</div>}{ride.phase && <div className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Latest driver update: {ride.phase}</div>}</Card>
      </div>
      <div className="space-y-5">
        <Card className="p-5"><h2 className="m-0 text-sm font-bold">Your driver</h2><div className="mt-4 flex items-center gap-3"><Avatar name={driver?.name || 'Driver'} /><div><div className="text-sm font-bold">{driver?.name}</div><div className="mt-1 text-[10px] text-slate-500">★ {driver?.rating} · {driver?.trips} demo trips</div></div><ShieldCheck size={17} className="ml-auto text-emerald-700" /></div><div className="mt-4 rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold">{ride.vehicle}</div><div className="mt-1 text-[10px] text-slate-500">Plate {ride.plate} · Shared with confirmed passengers only</div></div></Card>
        <Card className="p-5"><h2 className="m-0 text-sm font-bold">Illustrative cost breakdown</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Driver-set cost share; not a fare estimate.</p><div className="mt-4 space-y-3 text-xs"><CostLine label="Estimated fuel share" value={money(ride.price * .72)} /><CostLine label="Toll contribution" value={money(ride.price * .12)} /><CostLine label="Shared vehicle costs" value={money(ride.price * .16)} /><div className="border-t border-slate-100 pt-3"><CostLine label="Per passenger total" value={`${money(ride.price)} approx.`} bold /></div></div><div className="mt-4 rounded-lg bg-[#f3f8f5] p-3 text-[9px] leading-4 text-slate-500">Assumption: driver-configured contribution split; fuel benchmark ₹11/km. Illustrative CO₂ estimate around 1.8 kg for this sample trip.</div></Card>
        <Card className="p-5"><div className="flex items-center justify-between"><h2 className="m-0 text-sm font-bold">Passengers</h2><span className="text-[10px] text-slate-500">{requests.filter((req) => req.status === 'Accepted').length} confirmed</span></div><div className="mt-3 space-y-3">{requests.filter((req) => req.status === 'Accepted').map((req) => { const passenger = data.users.find((person) => person.id === req.passengerId); return <div key={req.id} className="flex items-center gap-2"><Avatar name={passenger?.name || 'Passenger'} small /><div className="flex-1"><div className="text-xs font-semibold">{passenger?.name}</div><div className="text-[10px] text-slate-500">Pickup: {req.pickup}</div></div><StatusBadge status="Accepted" /></div>; })}{requests.filter((req) => req.status === 'Accepted').length === 0 && <p className="mb-0 text-xs text-slate-500">No confirmed passengers yet.</p>}</div></Card>
        {driverActions ? <Card className="p-5"><h2 className="m-0 text-sm font-bold">Driver controls</h2><div className="mt-3 grid grid-cols-2 gap-2">{ride.status === 'Confirmed' && <button className="button-primary justify-center px-3 py-2.5 text-xs" disabled={requests.some((request) => request.status === 'Pending')} title={requests.some((request) => request.status === 'Pending') ? 'Review all pending requests before starting this trip.' : undefined} onClick={() => changeStatus('In Progress', 'Trip started')}>Start trip <ArrowRight size={13} /></button>}{ride.status === 'Confirmed' && requests.some((request) => request.status === 'Pending') && <p className="col-span-2 mb-0 text-[10px] text-amber-800">Review or decline pending requests before starting the trip.</p>}{ride.status === 'In Progress' && <><button className="button-secondary justify-center px-2 py-2 text-[10px]" onClick={() => changeStatus('In Progress', 'Arrived at pickup')}>Arrived at pickup</button><button className="button-secondary justify-center px-2 py-2 text-[10px]" onClick={() => changeStatus('In Progress', 'Passenger picked up')}>Passenger picked up</button><button className="button-primary justify-center px-3 py-2.5 text-xs" onClick={() => changeStatus('Completed')}>Complete trip <Check size={13} /></button></>}{['Open', 'Requested', 'Confirmed', 'In Progress'].includes(ride.status) && <button className="button-danger col-span-2 justify-center px-3 py-2 text-xs" onClick={() => changeStatus('Cancelled')}>Cancel trip</button>}{!['Confirmed', 'In Progress', 'Open', 'Requested'].includes(ride.status) && <p className="col-span-2 mb-0 text-xs text-slate-500">No more actions are available for this trip.</p>}</div></Card> : <Card className="p-5"><h2 className="m-0 text-sm font-bold">Seat request</h2>{mine?.status === 'Pending' ? <><p className="mt-2 text-xs text-slate-500">You requested {mine.seats} {mine.seats === 1 ? 'seat' : 'seats'} from {mine.pickup}. Waiting for driver response.</p><button className="button-danger mt-3 px-3 py-2 text-xs" onClick={cancelMine}>Cancel request</button></> : mine?.status === 'Accepted' ? <><div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Your {mine.seats} seat{mine.seats === 1 ? '' : 's'} are confirmed. Trip updates will appear here.</div><button className="button-danger mt-3 px-3 py-2 text-xs" disabled={['In Progress','Cancelled','Completed'].includes(ride.status)} onClick={cancelMine}>Cancel confirmed seat</button></> : mine?.status === 'Rejected' ? <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">The driver declined this request. Browse other available rides.</div> : ['Open', 'Requested', 'Confirmed'].includes(ride.status) && currentUser.role === 'Employee' ? <><div className="field-wrap mt-3"><label>Seats to request</label><select value={selectedSeats} onChange={(event) => setLocation(`/rides/${ride.id}?seats=${event.target.value}`)}><option value={1}>1 seat</option><option value={2}>2 seats</option><option value={3}>3 seats</option><option value={4}>4 seats</option></select></div><button className="button-primary mt-3 w-full justify-center py-2.5" disabled={ride.seats < selectedSeats} onClick={requestSeat}>Request {selectedSeats} seat{selectedSeats === 1 ? '' : 's'}</button></> : <p className="mt-2 text-xs text-slate-500">This ride cannot accept another request.</p>}</Card>}
      </div>
    </div>
  </>;
}

function CostLine({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex items-center justify-between ${bold ? 'font-bold text-slate-800' : 'text-slate-600'}`}><span>{label}</span><span>{value}</span></div>;
}

function DriverPage({ data, update, notify }: SharedProps) {
  const user = data.users.find((candidate) => candidate.id === data.currentUserId)!;
  const myRides = data.rides.filter((ride) => ride.driverId === user.id);
  const requestMap = data.requests.filter((request) => myRides.some((ride) => ride.id === request.rideId));
  const pending = requestMap.filter((request) => request.status === 'Pending');
  const accepted = requestMap.filter((request) => request.status === 'Accepted');
  const complete = myRides.filter((ride) => ride.status === 'Completed').length;
  const respond = (request: RideRequest, accept: boolean) => {
    const ride = myRides.find((item) => item.id === request.rideId);
    if (!ride) return;
    if (request.status !== 'Pending') { notify('Only pending seat requests can be answered.', 'error'); return; }
    if (!['Open', 'Requested', 'Confirmed'].includes(ride.status)) { notify('This ride can no longer accept request changes.', 'error'); return; }
    if (accept && ride.seats < request.seats) { notify('Not enough seats remain for this request.', 'error'); return; }
    update((current) => {
      const requests = current.requests.map((item) => item.id === request.id && item.status === 'Pending' ? { ...item, status: accept ? 'Accepted' as const : 'Rejected' as const } : item);
      const stillPending = requests.find((item) => item.id === request.id)?.status === 'Pending';
      if (stillPending) return current;
      const rides = current.rides.map((item) => item.id === ride.id ? {
        ...item,
        status: reconciledRideStatus(item, requests),
        seats: accept ? Math.max(0, item.seats - request.seats) : item.seats,
        passengers: accept ? [...new Set([...item.passengers, request.passengerId])] : item.passengers,
      } : item);
      const notice = { id: `notice-${Date.now()}`, userId: request.passengerId, title: accept ? 'Seat request accepted' : 'Seat request declined', body: accept ? `${user.name} confirmed your seat for ${ride.origin} to ${ride.destination}.` : `Your request for ${ride.origin} to ${ride.destination} was declined.`, read: false, createdAt: new Date().toISOString() };
      return { ...current, requests, rides, notices: [notice, ...current.notices] };
    });
    notify(accept ? 'Passenger accepted and notified.' : 'Request declined and passenger notified.');
  };
  return <>
    <PageHeading eyebrow={`Welcome back, ${user.name.split(' ')[0]}`} title="Your driver dashboard" description="Manage offered trips, decide on passenger requests and keep everyone in sync." action={<Link href="/offer" className="button-primary px-4 py-2.5"><Plus size={15} /> Offer a ride</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Rides offered" value={`${myRides.length}`} sub="Across your demo account" icon={CarFront} /><Stat label="Pending requests" value={`${pending.length}`} sub="Need your response" icon={Users} tone="amber" /><Stat label="Confirmed seats" value={`${accepted.length}`} sub="Passengers joining your rides" icon={CheckCheck} tone="blue" /><Stat label="Completed trips" value={`${complete}`} sub="Cost sharing estimated at ₹54 / trip" icon={Wallet} /></div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="m-0 text-sm font-bold">Incoming requests</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Review pickup and requested seat count</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">{pending.length} pending</span></div>
        {pending.length ? <div className="divide-y divide-slate-100">{pending.map((request) => { const passenger = data.users.find((person) => person.id === request.passengerId); const ride = data.rides.find((item) => item.id === request.rideId); return <div key={request.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><Avatar name={passenger?.name || 'Passenger'} small /><div className="flex-1"><div className="text-xs font-bold text-slate-800">{passenger?.name} <span className="font-normal text-slate-500">· {request.seats} seat</span></div><div className="mt-1 text-[10px] text-slate-500">Pickup {request.pickup} · {ride ? `${formatDate(ride.date)} at ${ride.time}` : 'Ride unavailable'}</div><div className="mt-1 text-[10px] text-slate-500">{ride?.origin} → {ride?.destination}</div></div><div className="flex gap-2"><button className="button-secondary px-3 py-2 text-xs" onClick={() => respond(request, false)}>Decline</button><button className="button-primary px-3 py-2 text-xs" onClick={() => respond(request, true)}><Check size={13} /> Accept</button></div></div>; })}</div> : <EmptyState icon={Users} title="No new requests" description="When a colleague requests a seat on your ride, it will appear here." />}</Card>
      <Card className="p-5"><div className="flex items-start justify-between"><div><h2 className="m-0 text-sm font-bold">Your vehicle</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Details shown with offered rides</p></div><CarFront size={18} className="text-emerald-700" /></div><div className="mt-5 rounded-xl bg-[#f4f7f8] p-4"><div className="text-sm font-bold text-slate-800">{user.vehicle || data.profile.vehicle}</div><div className="mt-1 text-xs text-slate-500">{user.plate || data.profile.plate}</div><div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px]"><span className="text-slate-500">Seat contribution</span><strong>{money(data.profile.price)} / passenger</strong></div></div><Link href="/profile" className="button-secondary mt-3 w-full justify-center py-2.5">Manage vehicle & profile <ArrowRight size={14} /></Link></Card>
    </div>
    <div className="mt-6"><div className="mb-3 flex items-end justify-between"><div><h2 className="m-0 text-sm font-bold text-slate-800">Your offered rides</h2><p className="mb-0 mt-1 text-[11px] text-slate-500">Open requests, trip progress and history</p></div><Link href="/offer" className="text-xs font-bold text-emerald-700">+ New ride</Link></div>
      {myRides.length ? <div className="grid gap-3 lg:grid-cols-2">{myRides.map((ride) => <Card key={ride.id} className="overflow-hidden"><RideMini ride={ride} data={data} /><div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><div className="text-[10px] text-slate-500">{data.requests.filter((request) => request.rideId === ride.id && request.status === 'Pending').length} pending · {data.requests.filter((request) => request.rideId === ride.id && request.status === 'Accepted').length} confirmed</div><Link href={`/rides/${ride.id}`} className="text-xs font-bold text-emerald-700">Manage trip <ArrowRight size={13} className="ml-1 inline" /></Link></div></Card>)}</div> : <EmptyState title="No rides offered yet" description="Add your commute once and let colleagues request a seat." action={<Link href="/offer" className="button-primary px-3 py-2">Offer your first ride</Link>} />}</div>
  </>;
}

function OfferPage({ data, update, notify }: SharedProps) {
  const [, setLocation] = useLocation();
  const user = data.users.find((candidate) => candidate.id === data.currentUserId)!;
  const [origin, setOrigin] = useState(user.home || 'Gachibowli');
  const [destination, setDestination] = useState(user.work || 'Hitech City');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState('08:30');
  const [seats, setSeats] = useState('2');
  const [vehicle, setVehicle] = useState(user.vehicle || data.profile.vehicle || 'Hyundai Creta');
  const [plate, setPlate] = useState(user.plate || data.profile.plate);
  const [price, setPrice] = useState(String(data.profile.price || 54));
  const [pickupPoints, setPickupPoints] = useState('Kondapur');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (origin === destination) { setError('Pickup and destination must be different areas.'); return; }
    if (!date || new Date(`${date}T00:00:00`) < new Date(new Date().toDateString())) { setError('Choose today or a future date.'); return; }
    if (!Number(seats) || Number(seats) < 1 || Number(seats) > 6) { setError('Choose between 1 and 6 passenger seats.'); return; }
    if (!vehicle.trim() || !plate.trim()) { setError('Add your vehicle model and plate.'); return; }
    if (!Number(price) || Number(price) < 1 || Number(price) > 500) { setError('Set a seat contribution between ₹1 and ₹500.'); return; }
    const newRide: Ride = { id: `ride-${Date.now()}`, driverId: user.id, origin, destination, date, time, seats: Number(seats), totalSeats: Number(seats), vehicle: vehicle.trim(), plate: plate.trim(), price: Number(price), distance: 10.8, detour: 1.2, pickupPoints: pickupPoints.split(',').map((place) => place.trim()).filter(Boolean), notes: notes.trim(), status: 'Open', passengers: [], createdAt: new Date().toISOString() };
    update((current) => ({ ...current, rides: [newRide, ...current.rides], profile: { ...current.profile, vehicle, plate, price: Number(price) }, users: current.users.map((person) => person.id === user.id ? { ...person, vehicle, plate } : person) }));
    setError(''); notify('Your ride is now visible to colleagues.'); setLocation('/driver');
  };
  return <><PageHeading eyebrow="Drive together" title="Offer a ride" description="List the commute you already make. Keep seat pricing and pickup expectations clear." />
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]"><Card className="p-5 md:p-7"><form onSubmit={submit} className="space-y-5">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800"><span className="step-number">1</span> Route & departure</div><div className="grid gap-3 sm:grid-cols-2"><div className="field-wrap"><label>Starting area</label><select value={origin} onChange={(event) => setOrigin(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div><div className="field-wrap"><label>Destination</label><select value={destination} onChange={(event) => setDestination(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div><div className="field-wrap"><label>Travel date</label><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="field-wrap"><label>Departure time</label><input required type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div><div className="field-wrap sm:col-span-2"><label>Pickup points <span className="font-normal text-slate-400">(comma separated)</span></label><input value={pickupPoints} onChange={(event) => setPickupPoints(event.target.value)} placeholder="Botanical Garden, Kondapur" /></div></div></div>
      <div className="border-t border-slate-100 pt-5"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800"><span className="step-number">2</span> Seats & contribution</div><div className="grid gap-3 sm:grid-cols-3"><div className="field-wrap"><label>Passenger seats</label><select value={seats} onChange={(event) => setSeats(event.target.value)}>{[1,2,3,4,5,6].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'seat' : 'seats'}</option>)}</select></div><div className="field-wrap sm:col-span-2"><label>Contribution per passenger (₹)</label><input type="number" min="1" max="500" required value={price} onChange={(event) => setPrice(event.target.value)} /></div></div><p className="mb-0 mt-2 text-[10px] text-slate-500">A transparent cost share for your commute, not a commercial fare.</p></div>
      <div className="border-t border-slate-100 pt-5"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800"><span className="step-number">3</span> Vehicle & notes</div><div className="grid gap-3 sm:grid-cols-2"><div className="field-wrap"><label>Vehicle</label><input required value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="Hyundai Creta" /></div><div className="field-wrap"><label>Plate number</label><input required value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="TS 09 AA 0000" /></div><div className="field-wrap sm:col-span-2"><label>Notes for passengers <span className="font-normal text-slate-400">(optional)</span></label><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Quiet ride, luggage space, preferred pickup detail…" /></div></div></div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}<div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Link href="/driver" className="button-secondary px-4 py-2.5">Cancel</Link><button className="button-primary px-4 py-2.5"><Plus size={15} /> Publish ride</button></div>
    </form></Card><div className="space-y-4"><Card className="p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck size={19} /></div><h3 className="mt-4 text-sm font-bold">Clear, considerate sharing</h3><ul className="mt-3 space-y-2 pl-4 text-[11px] leading-5 text-slate-600"><li>Set a fair contribution before requests arrive.</li><li>Use pickup points people can recognize.</li><li>Trip routes are illustrative, not live tracking.</li></ul></Card><Card className="p-5"><div className="text-[10px] font-extrabold uppercase tracking-[.14em] text-emerald-700">Estimate assumptions</div><div className="mt-3 space-y-2 text-xs"><CostLine label="Fuel baseline" value="₹11 / km" /><CostLine label="Distance" value="Illustrative" /><CostLine label="Emissions" value="~1.5 kg CO₂ / trip" /></div><p className="mb-0 mt-3 border-t border-slate-100 pt-3 text-[9px] leading-4 text-slate-500">Cost sharing remains your configured contribution. Estimates do not use live vehicle data.</p></Card></div></div>
  </>;
}

function NotificationsPage({ data, update, notify }: SharedProps) {
  const user = data.users.find((person) => person.id === data.currentUserId)!;
  const notices = data.notices.filter((notice) => notice.userId === user.id);
  const mark = (id: string) => update((current) => ({ ...current, notices: current.notices.map((notice) => notice.id === id ? { ...notice, read: true } : notice) }));
  const markAll = () => { update((current) => ({ ...current, notices: current.notices.map((notice) => notice.userId === user.id ? { ...notice, read: true } : notice) })); notify('All notifications marked as read.'); };
  return <><PageHeading eyebrow="Stay in the loop" title="Notifications" description="Demo updates for seat requests and trip status changes." action={notices.some((notice) => !notice.read) ? <button className="button-secondary px-3 py-2" onClick={markAll}><CheckCheck size={14} /> Mark all read</button> : null} />
    <Card>{notices.length ? <div className="divide-y divide-slate-100">{notices.map((notice) => <div key={notice.id} className={`flex gap-3 px-5 py-4 ${notice.read ? 'opacity-65' : 'bg-emerald-50/30'}`}><span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${notice.read ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-800'}`}><Bell size={16} /></span><div className="flex-1"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">{notice.title}{!notice.read && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-800">New</span>}</div><p className="mb-1 mt-1 text-xs leading-5 text-slate-600">{notice.body}</p><span className="text-[9px] text-slate-400">{new Date(notice.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · Demo update</span></div>{!notice.read && <button className="self-center text-[10px] font-bold text-emerald-700" onClick={() => mark(notice.id)}>Mark read</button>}</div>)}</div> : <EmptyState icon={Bell} title="You’re all caught up" description="Ride requests and trip changes will appear here." />}</Card>
  </>;
}

function ProfilePage({ data, update, notify, onReset }: SharedProps & { onReset: () => void }) {
  const user = data.users.find((person) => person.id === data.currentUserId)!;
  const [name, setName] = useState(user.name);
  const [home, setHome] = useState(data.profile.home);
  const [work, setWork] = useState(data.profile.work);
  const [phone, setPhone] = useState(user.phone);
  const [accessibility, setAccessibility] = useState(data.profile.accessibility);
  const [luggage, setLuggage] = useState(data.profile.luggage);
  const [emergencyName, setEmergencyName] = useState(data.profile.emergencyName);
  const [emergencyPhone, setEmergencyPhone] = useState(data.profile.emergencyPhone);
  const [vehicle, setVehicle] = useState(user.vehicle || data.profile.vehicle);
  const [plate, setPlate] = useState(user.plate || data.profile.plate);
  const [price, setPrice] = useState(String(data.profile.price));
  const [prefs, setPrefs] = useState(data.profile.preferences);
  useEffect(() => {
    setName(user.name);
    setHome(user.home || data.profile.home);
    setWork(user.work || data.profile.work);
    setPhone(user.phone);
    setAccessibility(data.profile.accessibility);
    setLuggage(data.profile.luggage);
    setEmergencyName(data.profile.emergencyName);
    setEmergencyPhone(data.profile.emergencyPhone);
    setVehicle(user.vehicle || data.profile.vehicle);
    setPlate(user.plate || data.profile.plate);
    setPrice(String(data.profile.price));
    setPrefs(data.profile.preferences);
  }, [user.id]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !emergencyName.trim()) { notify('Add your name and emergency contact name.', 'error'); return; }
    if (Number(price) < 1 || Number(price) > 500) { notify('Vehicle contribution must be between ₹1 and ₹500.', 'error'); return; }
    update((current) => ({ ...current, users: current.users.map((person) => person.id === user.id ? { ...person, name: name.trim(), home, work, phone, ...(user.role === 'Driver' ? { vehicle, plate } : {}) } : person), profile: { ...current.profile, home, work, accessibility, luggage, emergencyName, emergencyPhone, vehicle, plate, price: Number(price), preferences: prefs } }));
    notify('Profile and commute preferences saved.');
  };
  const togglePref = (pref: string) => setPrefs((current) => current.includes(pref) ? current.filter((value) => value !== pref) : [...current, pref]);
  return <><PageHeading eyebrow="Your details, your choice" title="Profile & settings" description="Edit demo profile and commute preferences. Contact details stay in this browser." />
    <form onSubmit={save} className="grid gap-5 xl:grid-cols-[1fr_330px]"><div className="space-y-5">
      <Card className="p-5"><div className="flex items-center gap-3 border-b border-slate-100 pb-4"><Avatar name={user.name} /><div><h2 className="m-0 text-sm font-bold">{user.name}</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">{user.role} · Demo profile</p></div><span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-800"><ShieldCheck size={12} className="mr-1 inline" /> Demo verified</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="field-wrap"><label>Display name</label><input required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="field-wrap"><label>Demo email</label><input value={user.email} disabled /></div><div className="field-wrap"><label>Phone (private in demo)</label><input value={phone} onChange={(event) => setPhone(event.target.value)} /></div><div className="field-wrap"><label>Home area</label><select value={home} onChange={(event) => setHome(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div><div className="field-wrap"><label>Work area</label><select value={work} onChange={(event) => setWork(event.target.value)}>{routePlaces.map((place) => <option key={place}>{place}</option>)}</select></div></div></Card>
      <Card className="p-5"><h2 className="m-0 text-sm font-bold">Commute preferences</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Used only to explain the demo ride ranking.</p><div className="mt-4 flex flex-wrap gap-2">{['No smoking', 'AC preferred', 'Quiet ride', 'Women-only preference'].map((pref) => <button type="button" key={pref} onClick={() => togglePref(pref)} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${prefs.includes(pref) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>{prefs.includes(pref) && <Check size={11} className="mr-1 inline" />}{pref}</button>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="field-wrap"><label>Accessibility preferences</label><select value={accessibility} onChange={(event) => setAccessibility(event.target.value)}><option>No specific needs</option><option>Step-free pickup preferred</option><option>Extra boarding time</option><option>Contact me before pickup</option></select></div><div className="field-wrap"><label>Luggage preference</label><select value={luggage} onChange={(event) => setLuggage(event.target.value)}><option>No luggage</option><option>Small bag</option><option>Medium luggage</option><option>Large luggage</option></select></div></div></Card>
      <Card className="p-5"><h2 className="m-0 text-sm font-bold">Emergency contact</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Fictional sample contact; no message is sent.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="field-wrap"><label>Contact name</label><input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} /></div><div className="field-wrap"><label>Contact phone</label><input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} /></div></div></Card>
      {user.role === 'Driver' && <Card className="p-5"><h2 className="m-0 text-sm font-bold">Vehicle and cost sharing</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="field-wrap"><label>Vehicle</label><input value={vehicle} onChange={(event) => setVehicle(event.target.value)} /></div><div className="field-wrap"><label>Plate</label><input value={plate} onChange={(event) => setPlate(event.target.value)} /></div><div className="field-wrap"><label>Contribution / seat (₹)</label><input type="number" min="1" max="500" value={price} onChange={(event) => setPrice(event.target.value)} /></div></div></Card>}
      <div className="flex justify-end"><button className="button-primary px-5 py-2.5">Save settings <Check size={15} /></button></div>
    </div><div className="space-y-5"><Card className="p-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-700" /><h2 className="m-0 text-sm font-bold">Privacy controls</h2></div><p className="mb-3 mt-2 text-[10px] leading-4 text-slate-500">Only masked details appear to other demo participants. No location is collected.</p><SettingToggle label="Share name & rating with matched colleagues" checked={data.profile.shareProfile} onChange={(value) => update((current) => ({ ...current, profile: { ...current.profile, shareProfile: value } }))} /><SettingToggle label="In-app trip notifications" checked={data.profile.notifications} onChange={(value) => update((current) => ({ ...current, profile: { ...current.profile, notifications: value } }))} /></Card><Card className="p-5"><div className="flex items-center gap-2"><CircleHelp size={17} className="text-blue-700" /><h2 className="m-0 text-sm font-bold">Demo assumptions</h2></div><div className="mt-4 space-y-2 text-[10px] text-slate-600"><CostLine label="Fuel baseline" value="₹11 / km" /><CostLine label="Typical sample distance" value="12.4 km" /><CostLine label="CO₂ factor" value="~1.5 kg / trip" /></div><p className="mb-0 mt-3 border-t border-slate-100 pt-3 text-[9px] leading-4 text-slate-500">Savings and emissions are illustrative calculations; not measured or guaranteed.</p></Card><Card className="border-red-100 p-5"><h2 className="m-0 text-sm font-bold text-slate-800">Reset demo data</h2><p className="mb-3 mt-2 text-[10px] leading-4 text-slate-500">Remove all ride requests and edits from this browser, then restore the sample workspace.</p><button type="button" onClick={onReset} className="button-danger w-full justify-center px-3 py-2">Reset all demo data</button></Card></div></form>
  </>;
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-slate-100 py-3 first:border-0"><span className="text-[10px] leading-4 text-slate-700">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-emerald-700" /></label>;
}

function AdminPage({ data, update, notify }: SharedProps) {
  const [query, setQuery] = useState('');
  const [rideFilter, setRideFilter] = useState('All statuses');
  const totalRequests = data.requests.length;
  const complete = data.rides.filter((ride) => ride.status === 'Completed').length;
  const cancelled = data.rides.filter((ride) => ride.status === 'Cancelled').length;
  const active = data.rides.filter((ride) => !['Completed', 'Cancelled'].includes(ride.status)).length;
  const pending = data.requests.filter((request) => request.status === 'Pending').length;
  const sharedKm = complete * 12.4;
  const commuteHistory = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const rides = data.rides.filter((ride) => ride.date === key);
    return { day: date.toLocaleDateString('en-IN', { weekday: 'short' }), listed: rides.filter((ride) => ride.status !== 'Cancelled').length, completed: rides.filter((ride) => ride.status === 'Completed').length };
  });
  const filtered = data.rides.filter((ride) => (rideFilter === 'All statuses' || ride.status === rideFilter) && `${ride.origin} ${ride.destination} ${data.users.find((user) => user.id === ride.driverId)?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
  const setRideStatus = (ride: Ride, status: RideStatus) => {
    if (['Cancelled', 'Completed'].includes(status) && !window.confirm(`Set this ride to ${status.toLowerCase()}?`)) return;
    update((current) => {
      const passengerIds = current.requests.filter((request) => request.rideId === ride.id && ['Accepted', 'Pending'].includes(request.status)).map((request) => request.passengerId);
      const recipients = [...new Set([ride.driverId, ...passengerIds])].filter((id) => id !== current.currentUserId);
      const notices: Notice[] = recipients.map((id) => ({ id: `notice-${Date.now()}-${id}`, userId: id, title: `Ride ${status.toLowerCase()}`, body: `Operations marked ${ride.origin} to ${ride.destination} ${status.toLowerCase()}.`, read: false, createdAt: new Date().toISOString() }));
      const requests = status === 'Cancelled'
        ? current.requests.map((request) => request.rideId === ride.id && ['Accepted', 'Pending'].includes(request.status) ? { ...request, status: 'Cancelled' as const } : request)
        : current.requests;
      return { ...current, requests, rides: current.rides.map((item) => item.id === ride.id ? { ...item, status } : item), notices: [...notices, ...current.notices] };
    });
    notify(`Ride ${ride.id} marked ${status.toLowerCase()}.`);
  };
  const userSearch = query.toLowerCase();
  return <>
    <PageHeading eyebrow="Demo operations" title="Commute network overview" description="A live view of this browser’s sample rides, passenger requests and illustrative impact." action={<span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">Demo data only</span>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Demo users" value={`${data.users.length}`} sub={`${data.users.filter((person) => person.role === 'Driver').length} drivers · ${data.users.filter((person) => person.role === 'Employee').length} passengers` } icon={Users} /><Stat label="Active rides" value={`${active}`} sub="Open through in-progress" icon={CarFront} /><Stat label="Pending requests" value={`${pending}`} sub={`${totalRequests} total requests`} icon={Clock3} tone="amber" /><Stat label="Completed trips" value={`${complete}`} sub={`${cancelled} cancelled · ${sharedKm.toFixed(1)} km shared`} icon={Leaf} /></div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card className="p-5"><div className="flex items-start justify-between"><div><h2 className="m-0 text-sm font-bold">Commute activity</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Ride listings & completed trips · sample data</p></div><span className="rounded-md bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-500">Illustrative</span></div><div className="mt-4 h-[165px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={commuteHistory} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9eef0" /><XAxis dataKey="day" tick={{ fontSize: 9, fill: '#8693a0' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#8693a0' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #e1e8e4' }} /><Bar dataKey="listed" name="Rides listed" fill="#a8cdbc" radius={[4, 4, 0, 0]} maxBarSize={20} /><Bar dataKey="completed" name="Completed trips" fill="#278360" radius={[4, 4, 0, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer></div><div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 text-[9px] text-slate-500"><span>Counts derive from saved demo rides</span><span>Est. savings: ₹{(complete * 96).toLocaleString('en-IN')}</span></div></Card>
      <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="m-0 text-sm font-bold">Sustainability estimate</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Based on completed demo trips only</p></div><Leaf size={17} className="text-emerald-700" /></div><div className="mt-6 brand-type text-4xl font-extrabold text-slate-800">{(complete * 1.8).toFixed(1)} <span className="text-base">kg CO₂</span></div><p className="mt-1 text-[10px] text-slate-500">Illustrative savings · not measured emissions</p><div className="mt-5 rounded-xl bg-[#f3f8f5] p-3 text-[10px] leading-5 text-slate-600"><strong className="text-slate-800">Assumptions</strong><br />12.4 km average shared trip · ₹11/km fuel baseline · 1.5 kg CO₂ per shared trip.</div></Card>
    </div>
    <Card className="mt-6 overflow-hidden"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="m-0 text-sm font-bold">Ride management</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Search, inspect or update demo ride status</p></div><div className="flex gap-2"><label className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input aria-label="Search rides or people" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs sm:w-48" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search routes, driver" /></label><select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" value={rideFilter} onChange={(event) => setRideFilter(event.target.value)}>{['All statuses', 'Open', 'Requested', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div></div>
      {filtered.length ? <div className="scrollbar-slim overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Route & driver</th><th className="px-4 py-3">Departure</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Requests</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((ride) => { const driver = data.users.find((person) => person.id === ride.driverId); const rideRequests = data.requests.filter((request) => request.rideId === ride.id); return <tr key={ride.id} className="text-xs"><td className="px-5 py-3"><div className="font-bold text-slate-800">{ride.origin} → {ride.destination}</div><div className="mt-1 text-[10px] text-slate-500">{driver?.name} · {ride.vehicle}</div></td><td className="px-4 py-3 text-slate-600">{formatDate(ride.date)}<br /><span className="text-[10px]">{ride.time}</span></td><td className="px-4 py-3 text-slate-600">{ride.seats} / {ride.totalSeats}</td><td className="px-4 py-3 text-slate-600">{rideRequests.length}</td><td className="px-4 py-3"><StatusBadge status={ride.status} /></td><td className="px-5 py-3 text-right"><div className="flex justify-end gap-2"><Link href={`/rides/${ride.id}`} className="button-table">View</Link>{!['Cancelled','Completed'].includes(ride.status) && <button className="button-table text-red-700" onClick={() => setRideStatus(ride, 'Cancelled')}>Cancel</button>}</div></td></tr>; })}</tbody></table></div> : <EmptyState title="No matching rides" description="Adjust your search or status filter." />}
    </Card>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]"><Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="m-0 text-sm font-bold">Demo users</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Fictional accounts with editable verification status</p></div><div className="divide-y divide-slate-100">{data.users.filter((person) => !userSearch || `${person.name} ${person.email} ${person.role}`.toLowerCase().includes(userSearch)).map((person) => <div key={person.id} className="flex items-center gap-3 px-5 py-3"><Avatar name={person.name} small /><div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-800">{person.name}</div><div className="text-[10px] text-slate-500">{person.role} · {person.team}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{person.verified ? 'Demo verified' : 'Needs review'}</span><button className="text-[10px] font-bold text-emerald-700" onClick={() => { update((current) => ({ ...current, users: current.users.map((item) => item.id === person.id ? { ...item, verified: !item.verified } : item) })); notify(`${person.name} verification status updated.`); }}>{person.verified ? 'Revoke' : 'Verify'}</button></div>)}</div></Card>
      <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="m-0 text-sm font-bold">Passenger requests</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Requests currently held in this demo workspace</p></div>{data.requests.length ? <div className="scrollbar-slim overflow-x-auto"><table className="w-full min-w-[480px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Passenger</th><th className="px-3 py-3">Route</th><th className="px-3 py-3">Pickup</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{data.requests.map((request) => { const ride = data.rides.find((item) => item.id === request.rideId); const passenger = data.users.find((person) => person.id === request.passengerId); return <tr key={request.id} className="text-[10px]"><td className="px-5 py-3 font-semibold text-slate-700">{passenger?.name || 'Unknown'}</td><td className="px-3 py-3 text-slate-600">{ride?.origin} → {ride?.destination}</td><td className="px-3 py-3 text-slate-600">{request.pickup}</td><td className="px-5 py-3"><StatusBadge status={request.status} /></td></tr>; })}</tbody></table></div> : <EmptyState icon={Users} title="No requests yet" description="Employee requests will appear here." />}</Card></div>
    <Card className="mt-6 overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="m-0 text-sm font-bold">Reported issues</h2><p className="mb-0 mt-1 text-[10px] text-slate-500">Fictional sample reports · saved in this browser</p></div>{data.issues.length ? <div className="divide-y divide-slate-100">{data.issues.map((issue) => <div key={issue.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800"><CircleHelp size={17} /></span><div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-800">{issue.title} <span className="ml-1 text-[9px] font-normal text-slate-400">Sample report</span></div><p className="mb-0 mt-1 text-[10px] leading-4 text-slate-500">{issue.detail}{issue.rideId && ` · ${issue.rideId}`}</p><div className="mt-1 text-[9px] text-slate-400">{new Date(issue.createdAt).toLocaleDateString('en-IN')}</div></div><select aria-label={`Update issue ${issue.title}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold" value={issue.status} onChange={(event) => { const status = event.target.value as DemoIssue['status']; update((current) => ({ ...current, issues: current.issues.map((item) => item.id === issue.id ? { ...item, status } : item) })); notify('Issue status saved.'); }}><option>Open</option><option>Reviewing</option><option>Resolved</option></select></div>)}</div> : <EmptyState icon={CircleHelp} title="No reported issues" description="Sample reports will appear here." />}</Card>
    <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-5 text-slate-500"><strong className="text-slate-700">Prototype limits:</strong> users, rides, issues, and trip activity are fictional and stored only in this browser. No secure authentication, AI service, live GPS, or emissions measurement is connected.</div>
  </>;
}

function EmptyState({ icon: Icon = Compass, title, description, action }: { icon?: typeof Activity; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-[190px] flex-col items-center justify-center px-5 py-8 text-center"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eff5f2] text-emerald-800"><Icon size={19} /></span><h3 className="mb-0 mt-3 text-sm font-bold text-slate-800">{title}</h3><p className="mb-0 mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function NotFound() {
  return <div className="py-16 text-center"><div className="brand-type text-5xl font-extrabold text-slate-800">404</div><p className="mt-2 text-sm text-slate-500">That commute is off the map.</p><Link className="button-primary mt-4 px-4 py-2" href="/dashboard">Back to dashboard</Link></div>;
}

export default App;