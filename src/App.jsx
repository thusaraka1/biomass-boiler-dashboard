import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Thermometer, Wind, Droplets, Flame, Gauge, Activity, Waves, Cpu, Wifi, WifiOff } from "lucide-react";
import { database } from "./firebaseConfig";
import { ref, onValue } from "firebase/database";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value, digits = 2) => Number(value.toFixed(digits));

function randomWalk(current, min, max, step) {
  const next = current + (Math.random() * 2 - 1) * step;
  return clamp(next, min, max);
}

function calculateMetrics(s) {
  const Tg = s.flueGasTemp;
  const Ta = s.ambientTemp;
  const deltaT = Math.max(Tg - Ta, 1);
  const O2 = clamp(s.o2Percent, 1, 20.5);
  const CO2 = Math.max(s.co2Percent, 0.1);
  const CO_percent = Math.max(s.coPpm / 10000, 0.0001); // ppm -> %
  const H = s.hydrogenFraction;
  const Mf = s.moistureFraction;

  const dryFlueGasLoss = ((deltaT * 0.66) / Math.max(21 - O2, 0.5));
  const hydrogenLoss = 9 * H * deltaT * 0.00024 * 100;
  const moistureLoss = Mf * deltaT * 0.0008 * 100;
  const coLoss = (CO_percent / (CO_percent + CO2)) * 100;
  const radiationLoss = 3.0;

  const flowRateLpm = s.pulseFrequency / 7.5;
  const massFlowKgS = (flowRateLpm / 60);
  const usefulHeatOutputKW = massFlowKgS * 4.186 * Math.max(s.waterOutTemp - s.waterInTemp, 0);

  const totalLosses = dryFlueGasLoss + hydrogenLoss + moistureLoss + coLoss + radiationLoss;
  const efficiency = clamp(100 - totalLosses, 0, 100);

  return {
    dryFlueGasLoss: round(dryFlueGasLoss),
    hydrogenLoss: round(hydrogenLoss),
    moistureLoss: round(moistureLoss),
    coLoss: round(coLoss),
    radiationLoss: round(radiationLoss),
    totalLosses: round(totalLosses),
    efficiency: round(efficiency),
    flowRateLpm: round(flowRateLpm),
    massFlowKgS: round(massFlowKgS, 3),
    usefulHeatOutputKW: round(usefulHeatOutputKW),
  };
}

function buildNextSensorState(prev) {
  return {
    ambientTemp: randomWalk(prev.ambientTemp, 24, 34, 0.2),
    flueGasTemp: randomWalk(prev.flueGasTemp, 150, 260, 4),
    o2Percent: randomWalk(prev.o2Percent, 5, 12, 0.25),
    co2Percent: randomWalk(prev.co2Percent, 7, 15, 0.2),
    coPpm: randomWalk(prev.coPpm, 120, 1400, 30),
    pulseFrequency: randomWalk(prev.pulseFrequency, 15, 60, 1.2),
    waterInTemp: randomWalk(prev.waterInTemp, 45, 62, 0.35),
    waterOutTemp: randomWalk(prev.waterOutTemp, 58, 84, 0.45),
    hydrogenFraction: prev.hydrogenFraction,
    moistureFraction: prev.moistureFraction,
    humidity: prev.humidity ?? null,
  };
}

const initialSensors = {
  ambientTemp: 29,
  flueGasTemp: 198,
  o2Percent: 8.6,
  co2Percent: 11.8,
  coPpm: 380,
  pulseFrequency: 31,
  waterInTemp: 52,
  waterOutTemp: 68,
  hydrogenFraction: 0.06,
  moistureFraction: 0.12,
  humidity: null,
};

// Fields that come from real ESP32 sensors
const LIVE_FIELDS = new Set(["ambientTemp", "humidity", "coPpm", "flowRate"]);

function MetricCard({ title, value, unit, icon: Icon, subtitle, isLive }) {
  return (
    <Card className="rounded-2xl shadow-sm border border-slate-200/50 bg-white/70 backdrop-blur-md transition-all hover:shadow-md hover:bg-white/90">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-500">{title}</p>
              {isLive !== undefined && (
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {isLive ? 'LIVE' : 'SIM'}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-bold tracking-tight text-slate-900">{value}</span>
              <span className="pb-1 text-sm font-medium text-slate-500">{unit}</span>
            </div>
            {subtitle ? <p className="mt-2 text-xs font-medium text-slate-400">{subtitle}</p> : null}
          </div>
          <div className={`rounded-2xl p-3 shadow-sm ring-1 ${isLive ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-slate-50 text-slate-500 ring-slate-100'}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SensorRow({ label, value, isLive }) {
  return (
    <div className="group flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:bg-white hover:shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
          {isLive ? '● ESP32' : 'SIM'}
        </span>
      </div>
      <strong className="text-lg font-bold text-slate-900">{value}</strong>
    </div>
  );
}

export default function BiomassBoilerDashboard() {
  const [sensors, setSensors] = useState(initialSensors);
  const [history, setHistory] = useState([]);
  const [espConnected, setEspConnected] = useState(false);
  const [espData, setEspData] = useState(null);
  const metrics = useMemo(() => calculateMetrics(sensors), [sensors]);

  // -------- Firebase: Listen for ESP32 data --------
  useEffect(() => {
    const sensorRef = ref(database, "/sensorData");
    const unsubscribe = onValue(
      sensorRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setEspData(data);
        }
      },
      (error) => {
        console.error("Firebase read error:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Monitor connection health based on serverTime
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (espData && espData.serverTime) {
        // Firebase SERVER_TIMESTAMP is in milliseconds. 
        // We calculate if it hasn't changed in the last 10 seconds.
        // Actually, better: if the time difference between NOW and serverTime is too high.
        // But local clock and server clock might drift. 
        // Best approach: If serverTime hasn't updated for two cycles of onValue.
        // Or simply: if (Date.now() - espData.serverTime > 10000)
        const age = Date.now() - espData.serverTime;
        setEspConnected(age < 10000); 
      } else {
        setEspConnected(false);
      }
    }, 2000);
    return () => clearInterval(checkInterval);
  }, [espData]);

  // Seed history on mount
  useEffect(() => {
    const seed = [];
    let rolling = initialSensors;
    for (let i = 0; i < 18; i += 1) {
      rolling = buildNextSensorState(rolling);
      const m = calculateMetrics(rolling);
      seed.push({
        t: `${i + 1}`,
        efficiency: m.efficiency,
        heat: m.usefulHeatOutputKW,
        flue: rolling.flueGasTemp,
        o2: rolling.o2Percent,
        co: rolling.coPpm,
      });
    }
    setHistory(seed);
  }, []);

  // -------- Merge ESP32 data with simulated data every 2s --------
  useEffect(() => {
    const id = setInterval(() => {
      setSensors((prev) => {
        // Build next simulated state for fields without real sensors
        const next = buildNextSensorState(prev);
        if (next.waterOutTemp < next.waterInTemp + 5) {
          next.waterOutTemp = next.waterInTemp + 5;
        }

        // Overwrite with real ESP32 data (only available sensor fields)
        if (espData) {
          if (espData.temperature !== undefined) {
            next.ambientTemp = espData.temperature;
          }
          if (espData.humidity !== undefined) {
            next.humidity = espData.humidity;
          }
          if (espData.gasValue !== undefined) {
            next.coPpm = espData.gasValue;
          }
          if (espData.flowRate !== undefined) {
            // flowRate from ESP32 is already in L/min
            // Dashboard uses pulseFrequency to calculate flowRate via / 7.5
            // So we reverse it: pulseFrequency = flowRate * 7.5
            next.pulseFrequency = espData.flowRate * 7.5;
          }
        }

        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [espData]);

  // Update history
  useEffect(() => {
    setHistory((prev) => {
      const nextId = prev.length > 0 ? parseInt(prev[prev.length - 1].t, 10) + 1 : prev.length + 1;
      const next = [...prev, {
        t: `${nextId}`,
        efficiency: metrics.efficiency,
        heat: metrics.usefulHeatOutputKW,
        flue: round(sensors.flueGasTemp),
        o2: round(sensors.o2Percent),
        co: round(sensors.coPpm),
      }];
      return next.slice(-24);
    });
  }, [metrics.efficiency, metrics.usefulHeatOutputKW, sensors.flueGasTemp, sensors.o2Percent, sensors.coPpm]);

  const losses = [
    { name: "Dry flue gas", value: metrics.dryFlueGasLoss },
    { name: "Hydrogen", value: metrics.hydrogenLoss },
    { name: "Moisture", value: metrics.moistureLoss },
    { name: "CO formation", value: metrics.coLoss },
    { name: "Radiation", value: metrics.radiationLoss },
  ];

  const hasEspData = espConnected && espData;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-emerald-50/50 p-4 md:p-8 font-sans selection:bg-emerald-200 selection:text-emerald-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
          <Card className="group relative overflow-hidden rounded-[32px] border border-slate-200/50 bg-white shadow-xl transition-all hover:shadow-emerald-900/10">
            <div className="absolute -inset-x-20 -top-20 h-40 w-[200%] rotate-12 bg-gradient-to-r from-emerald-500/10 via-emerald-400/5 to-transparent blur-3xl opacity-50" />
            <CardContent className="relative p-7 md:p-10">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-xl">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {hasEspData ? (
                      <Badge className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 shadow-sm">
                        <Wifi className="mr-1.5 h-3 w-3" />
                        <span className="mr-1.5 flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ESP32 Connected
                      </Badge>
                    ) : (
                      <Badge className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 border border-amber-200 hover:bg-amber-200 shadow-sm">
                        <WifiOff className="mr-1.5 h-3 w-3" />
                        Waiting for ESP32
                      </Badge>
                    )}
                    <Badge variant="secondary" className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                      {hasEspData ? "ESP32 → Firebase → Web" : "Simulated Data"}
                    </Badge>
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight lg:text-5xl text-slate-900">
                    Biomass Boiler Efficiency Dashboard
                  </h1>
                  <p className="mt-4 text-slate-600 leading-relaxed text-sm md:text-base">
                    {hasEspData
                      ? "Real-time data from ESP32 sensors (temperature, humidity, gas, flow) via Firebase. Other fields are simulated for demonstration."
                      : "Waiting for ESP32 sensor data via Firebase. Currently showing simulated values for all fields."
                    }
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3 self-start sm:flex-nowrap md:min-w-[240px]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 px-4 transition-colors hover:bg-slate-100 min-w-[120px]">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"><Cpu className="h-3.5 w-3.5 text-slate-400" /> Controller</div>
                    <div className="mt-1.5 text-base font-bold tracking-tight text-slate-900">ESP32</div>
                  </div>
                  <div className={`rounded-2xl border p-3 px-4 transition-colors min-w-[110px] ${hasEspData ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                    <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${hasEspData ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {hasEspData ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 text-slate-400" />}
                      Status
                    </div>
                    <div className={`mt-1.5 text-base font-bold tracking-tight ${hasEspData ? 'text-emerald-700' : 'text-slate-900'}`}>
                      {hasEspData ? "Online" : "Offline"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-3 relative z-10">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl shadow-slate-200/20">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Overall Boiler Efficiency</p>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${hasEspData ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {hasEspData ? 'CALC (LIVE)' : 'SIMULATED'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-6xl font-black tracking-tighter text-slate-900">{metrics.efficiency}</span>
                    <span className="pb-2 text-xl font-bold text-slate-500">%</span>
                  </div>
                  <Progress value={metrics.efficiency} className="mt-6 h-3 bg-slate-100 shadow-inner" />
                </div>
                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase tracking-wider text-rose-500">Total Losses</p>
                    {hasEspData && <span className="text-[10px] font-bold text-rose-600 uppercase">Partially Live</span>}
                  </div>
                  <div className="mt-4 flex items-end gap-2 text-rose-900">
                    <span className="text-6xl font-black tracking-tighter">{metrics.totalLosses}</span>
                    <span className="pb-2 text-xl font-bold text-rose-500">%</span>
                  </div>
                </div>
                <div className="rounded-3xl border border-emerald-500 bg-gradient-to-br from-emerald-400 to-emerald-500 p-6 text-emerald-950 shadow-emerald-500/30 shadow-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase tracking-wider opacity-90 text-emerald-900">Useful Heat Output</p>
                    {hasEspData && <Badge className="bg-white/20 text-white border-white/30 text-[10px]">LIVE FLOW</Badge>}
                  </div>
                  <div className="mt-4 flex items-end gap-2 text-white">
                    <span className="text-6xl font-black tracking-tighter drop-shadow-sm">{metrics.usefulHeatOutputKW}</span>
                    <span className="pb-2 text-xl font-bold opacity-90">kW</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[32px] border border-slate-200/60 bg-white/70 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
            <CardHeader className="p-7 pb-4">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" />
                Live Sensor Readings
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-7 pb-7">
              <SensorRow label="Ambient temp (DHT22)" value={`${round(sensors.ambientTemp)} °C`} isLive={hasEspData} />
              {sensors.humidity !== null && (
                <SensorRow label="Humidity (DHT22)" value={`${round(sensors.humidity)} %`} isLive={hasEspData} />
              )}
              <SensorRow label="Flue gas temp" value={`${round(sensors.flueGasTemp)} °C`} isLive={false} />
              <SensorRow label="O₂ concentration" value={`${round(sensors.o2Percent)} %`} isLive={false} />
              <SensorRow label="CO₂ concentration" value={`${round(sensors.co2Percent)} %`} isLive={false} />
              <SensorRow label="Gas sensor (MQ)" value={`${round(sensors.coPpm)}`} isLive={hasEspData} />
              <SensorRow label="Flow rate" value={`${metrics.flowRateLpm} L/min`} isLive={hasEspData} />
              <SensorRow label="Water in / out" value={`${round(sensors.waterInTemp)} / ${round(sensors.waterOutTemp)} °C`} isLive={false} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Dry Flue Gas Loss" value={metrics.dryFlueGasLoss} unit="%" icon={Wind} subtitle="L1 = ((Tg − Ta) × 0.66) / (21 − O₂)" isLive={false} />
          <MetricCard title="Hydrogen Loss" value={metrics.hydrogenLoss} unit="%" icon={Flame} subtitle="L2 = 9H(Tg − Ta) × 0.00024 × 100" isLive={false} />
          <MetricCard title="Moisture Loss" value={metrics.moistureLoss} unit="%" icon={Droplets} subtitle="L3 = Mf(Tg − Ta) × 0.0008 × 100" isLive={false} />
          <MetricCard title="CO Formation Loss" value={metrics.coLoss} unit="%" icon={Gauge} subtitle="L4 = CO / (CO + CO₂) × 100" isLive={hasEspData} />
        </div>

        <Tabs defaultValue="charts" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-white p-1 shadow-sm">
            <TabsTrigger value="charts" className="rounded-xl">Live Charts</TabsTrigger>
            <TabsTrigger value="breakdown" className="rounded-xl">Loss Breakdown</TabsTrigger>
            <TabsTrigger value="formula" className="rounded-xl">Formula & Logic</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="grid gap-4 sm:grid-cols-2 mt-4">
            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Efficiency Trend</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="efficiency" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorEfficiency)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Heat Output Trend</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorHeat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="heat" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorHeat)" name="Output (kW)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Combustion Indicators</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="flue" stroke="#ef4444" strokeWidth={3} dot={false} name="Flue Temp (°C)" />
                    <Line type="monotone" dataKey="o2" stroke="#3b82f6" strokeWidth={3} dot={false} name="O₂ (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Gas Sensor Trend</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="co" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCo)" name="Gas Sensor" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] mt-4">
            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader><CardTitle className="text-lg font-bold text-slate-800">Loss Components</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {losses.map((item) => (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{item.name}</span>
                      <span className="font-medium text-slate-900">{item.value}%</span>
                    </div>
                    <Progress value={Math.min(item.value, 100)} className="h-3" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader><CardTitle className="text-lg font-bold text-slate-800">Water-Side Output</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500"><Waves className="h-4 w-4" /> Flow conversion</div>
                  <div className="mt-2 text-2xl font-semibold">{metrics.flowRateLpm} L/min</div>
                  <p className="mt-1 text-sm text-slate-500">Flowrate = PulseFrequency / 7.5</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500"><Droplets className="h-4 w-4" /> Mass flow</div>
                  <div className="mt-2 text-2xl font-semibold">{metrics.massFlowKgS} kg/s</div>
                  <p className="mt-1 text-sm text-slate-500">ṁ ≈ Flowrate / 60 for water</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500"><Thermometer className="h-4 w-4" /> Temperature rise</div>
                  <div className="mt-2 text-2xl font-semibold">{round(sensors.waterOutTemp - sensors.waterInTemp)} °C</div>
                  <p className="mt-1 text-sm text-slate-500">ΔT = Tout − Tin</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="formula" className="mt-4">
            <Card className="rounded-[24px] border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader><CardTitle className="text-lg font-bold text-slate-800">Formula Mapping Used in Dashboard</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4 text-sm leading-6 text-slate-700">
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Dry flue gas loss</strong><br />L1 = ((Tg − Ta) × 0.66) / (21 − O₂)</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Hydrogen loss</strong><br />L2 = 9 × H × (Tg − Ta) × 0.00024 × 100</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Moisture loss</strong><br />L3 = Mf × (Tg − Ta) × 0.0008 × 100</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>CO loss</strong><br />L4 = CO / (CO + CO₂) × 100, with CO converted from ppm to %</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Radiation loss</strong><br />L5 = 3%</div>
                </div>
                <div className="space-y-4 text-sm leading-6 text-slate-700">
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Overall efficiency</strong><br />η = 100 − (L1 + L2 + L3 + L4 + L5)</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Flow conversion</strong><br />Flowrate = PulseFrequency / 7.5</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Mass flow of water</strong><br />ṁ ≈ Flowrate / 60</div>
                  <div className="rounded-2xl bg-slate-50 p-4"><strong>Useful heat output</strong><br />Q = ṁ × 4.186 × (Tout − Tin)</div>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                    <strong>Data Sources</strong><br />
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 mr-1">ESP32</span>
                    Temperature, Humidity, Gas sensor, Flow rate
                    <br />
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 mr-1">SIM</span>
                    Flue gas temp, O₂, CO₂, Water temps, H fraction, Moisture fraction
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
