"use client";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";

interface ApiKey {
  id: string; name: string; key: string; scope: string; isActive: boolean;
  requests: number; limit: number; lastUsed: string | null; createdAt: string;
}

interface ApiLog {
  id: string; method: string; endpoint: string; statusCode: number;
  durationMs: number; ip: string; createdAt: string;
}

interface MonitoringStats {
  totalRequestsToday: number; errorsToday: number; avgLatencyMs: number;
  topEndpoints: { endpoint: string; count: number }[];
}

const ApiDashboardPage = (): JSX.Element => {
  const { limits, loading: limitsLoading } = useSubscriptionLimits();
  const router = useRouter();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGen, setShowGen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState("full");
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [filterMethod, setFilterMethod] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEndpoint, setFilterEndpoint] = useState("");

  // Rediriger si le plan ne donne pas accès à l'API
  useEffect(() => {
    if (!limitsLoading && limits && !limits.hasApi) {
      router.push("/");
    }
  }, [limits, limitsLoading, router]);

  const fetchKeys = async () => {
    const res = await api.get("/api/v1/api-keys");
    const raw = res.data;
    setKeys(Array.isArray(raw) ? raw : (raw?.data ?? []));
  };

  const fetchLogs = async () => {
    try {
      const params: any = { page: logsPage, limit: 50 };
      if (filterMethod) params.method = filterMethod;
      if (filterStatus) params.statusCode = filterStatus;
      if (filterEndpoint) params.endpoint = filterEndpoint;
      const res = await api.get("/api/v1/api-logs", { params });
      setLogs(res.data.data || []);
      setLogsTotalPages(res.data.pagination?.totalPages || 1);
    } catch (err) { logger.error(String(err)); }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get("/api/v1/api-logs/stats");
      setStats(res.data);
    } catch (err) { logger.error(String(err)); }
  };

  useEffect(() => { (async () => { await Promise.all([fetchKeys(), fetchLogs(), fetchStats()]); setLoading(false); })(); }, []);
  useEffect(() => { fetchLogs(); }, [logsPage, filterMethod, filterStatus, filterEndpoint]);

  const generateKey = async () => {
    if (!newKeyName.trim()) return;
    await api.post("/api/v1/api-keys", { name: newKeyName, scope: newKeyScope });
    setShowGen(false); setNewKeyName(""); setNewKeyScope("full");
    fetchKeys();
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    await api.patch(`/api/v1/api-keys/${revokeTarget.id}/toggle`);
    setRevokeTarget(null); setRevokeLoading(false);
    fetchKeys();
  };

  if (loading || limitsLoading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dashboard API</h1><p className="text-muted-foreground">Gestion des clés API, logs et monitoring</p></div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">Clés API ({keys.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs requêtes</TabsTrigger>
          <TabsTrigger value="monitor">Monitoring</TabsTrigger>
        </TabsList>

        {/* === KEYS === */}
        <TabsContent value="keys" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{keys.filter(k => k.isActive).length} active(s) / {keys.length} totale(s)</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowGen(true)}>+ Nouvelle clé</Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-left">Nom</th><th className="p-3 text-left">Clé</th><th className="p-3 text-left">Scope</th><th className="p-3 text-left">Utilisation</th><th className="p-3 text-left">Statut</th><th className="p-3 text-left">Dernier appel</th><th className="p-3 text-left">Actions</th></tr></thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-medium">{k.name}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{k.key}</td>
                    <td className="p-3"><Badge variant="outline">{k.scope}</Badge></td>
                    <td className="p-3"><div className="text-xs">{k.requests.toLocaleString()} / {k.limit.toLocaleString()}</div><div className="h-1 bg-muted rounded-full mt-1 overflow-hidden"><div className={`h-full rounded-full ${k.requests/k.limit>0.8?"bg-red-500":k.requests/k.limit>0.6?"bg-orange-500":"bg-emerald-500"}`} style={{width:`${Math.min(100,(k.requests/k.limit)*100)}%`}}/></div></td>
                    <td className="p-3"><Badge variant={k.isActive?"default":"destructive"}>{k.isActive?"Actif":"Révoqué"}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{k.lastUsed?new Date(k.lastUsed).toLocaleString():"Jamais"}</td>
                    <td className="p-3"><Button variant="ghost" size="sm" onClick={() => setRevokeTarget(k)}>{k.isActive?"✕ Révoquer":"↩ Réactiver"}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* === LOGS === */}
        <TabsContent value="logs" className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Input placeholder="Endpoint..." className="max-w-[180px]" value={filterEndpoint} onChange={e => { setFilterEndpoint(e.target.value); setLogsPage(1); }} />
            <Select value={filterMethod} onValueChange={v => { setFilterMethod(v); setLogsPage(1); }}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Méthode" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">Toutes</SelectItem><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem><SelectItem value="PATCH">PATCH</SelectItem><SelectItem value="DELETE">DELETE</SelectItem></SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setLogsPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">Tous</SelectItem><SelectItem value="200">2xx</SelectItem><SelectItem value="400">4xx</SelectItem><SelectItem value="500">5xx</SelectItem></SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="sm" disabled={logsPage<=1} onClick={() => setLogsPage(p => p-1)}>← Précédent</Button>
              <span>Page {logsPage} / {logsTotalPages}</span>
              <Button variant="ghost" size="sm" disabled={logsPage>=logsTotalPages} onClick={() => setLogsPage(p => p+1)}>Suivant →</Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-left">Méthode</th><th className="p-3 text-left">Endpoint</th><th className="p-3 text-left">Statut</th><th className="p-3 text-left">Durée</th><th className="p-3 text-left">IP</th><th className="p-3 text-left">Date</th></tr></thead>
              <tbody>
                {logs.length===0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Aucun log trouvé</td></tr>}
                {logs.map(l => (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="p-3"><Badge variant="outline" className={`font-mono ${l.method==="GET"?"bg-emerald-500/10 text-emerald-400":l.method==="POST"?"bg-blue-500/10 text-blue-400":l.method==="PATCH"?"bg-purple-500/10 text-purple-400":"bg-red-500/10 text-red-400"}`}>{l.method}</Badge></td>
                    <td className="p-3 font-mono text-xs">{l.endpoint}</td>
                    <td className="p-3"><span className={l.statusCode>=400?"text-red-400":l.statusCode>=300?"text-orange-400":"text-emerald-400"}>{l.statusCode}</span></td>
                    <td className="p-3"><Badge variant={l.durationMs<50?"default":l.durationMs<150?"secondary":"destructive"} className="text-xs">{l.durationMs}ms</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{l.ip}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* === MONITORING === */}
        <TabsContent value="monitor" className="mt-4">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Requêtes aujourd'hui</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{stats.totalRequestsToday}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Erreurs (4xx/5xx)</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-red-500">{stats.errorsToday}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Latence moyenne</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{stats.avgLatencyMs}<span className="text-sm text-muted-foreground">ms</span></div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Endpoints</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{stats.topEndpoints.length}</div></CardContent></Card>
            </div>
          )}
          {stats?.topEndpoints && (
            <Card>
              <CardHeader><CardTitle>Top 5 Endpoints</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Endpoint</th><th className="py-2 text-right">Appels</th></tr></thead>
                  <tbody>{stats.topEndpoints.map((e, i) => <tr key={i} className="border-b border-border/50"><td className="py-2 font-mono text-xs">{e.endpoint}</td><td className="py-2 text-right">{e.count}</td></tr>)}</tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Générer une clé */}
      <Dialog open={showGen} onOpenChange={setShowGen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Générer une nouvelle clé API</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="keyName">Nom de la clé</Label><Input id="keyName" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} /></div>
            <div><Label>Portée (scope)</Label><Select value={newKeyScope} onValueChange={setNewKeyScope}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">Accès complet</SelectItem><SelectItem value="read">Lecture seule</SelectItem><SelectItem value="write">Lecture + Écriture</SelectItem><SelectItem value="gateway">Gateway uniquement</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setShowGen(false)}>Annuler</Button><Button onClick={generateKey} className="bg-emerald-600 hover:bg-emerald-700">Générer la clé</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmation révocation */}
      <Dialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revokeTarget?.isActive ? "Révoquer la clé" : "Réactiver la clé"}</DialogTitle>
            <DialogDescription>
              {revokeTarget?.isActive
                ? `Êtes-vous sûr de vouloir révoquer la clé "${revokeTarget?.name}" ? Les applications qui l'utilisent ne pourront plus accéder à l'API.`
                : `Voulez-vous réactiver la clé "${revokeTarget?.name}" ?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Annuler</Button>
            <Button variant={revokeTarget?.isActive ? "destructive" : "default"} onClick={confirmRevoke} disabled={revokeLoading}>
              {revokeLoading ? "En cours..." : revokeTarget?.isActive ? "Révoquer" : "Réactiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mini Card component inline
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card border rounded-lg ${className || ""}`}>{children}</div>
);
const CardHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 pb-2 ${className || ""}`}>{children}</div>
);
const CardContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 pt-0 ${className || ""}`}>{children}</div>
);
const CardTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={`font-semibold ${className || ""}`}>{children}</h3>
);

export default ApiDashboardPage;
