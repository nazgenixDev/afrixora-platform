"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: string;
  isActive: boolean;
  requests: number;
  limit: number;
  lastUsed: string | null;
  createdAt: string;
}

const mockLogs = [
  { method: "GET", ep: "/api/v1/buildings/1/dashboard", status: 200, dur: 38, key: "Dashboard Web", time: "14:59:12", ip: "196.188.x.x" },
  { method: "POST", ep: "/api/v1/gateway/sync", status: 200, dur: 142, key: "Gateway RPi", time: "14:58:44", ip: "10.0.0.12" },
  { method: "GET", ep: "/api/v1/readings/building/1/energy", status: 200, dur: 67, key: "Dashboard Web", time: "14:58:31", ip: "196.188.x.x" },
  { method: "POST", ep: "/api/v1/devices/NX-0004/command", status: 200, dur: 22, key: "ERP Immo", time: "14:57:58", ip: "102.22.x.x" },
  { method: "GET", ep: "/api/v1/alerts?status=active", status: 200, dur: 29, key: "Dashboard Web", time: "14:57:40", ip: "196.188.x.x" },
  { method: "POST", ep: "/api/v1/automations", status: 422, dur: 11, key: "ERP Immo", time: "14:56:15", ip: "102.22.x.x" },
  { method: "GET", ep: "/api/v1/devices/NX-9999", status: 404, dur: 8, key: "Dashboard Web", time: "14:55:03", ip: "196.188.x.x" },
  { method: "PATCH", ep: "/api/v1/alerts/al-44/acknowledge", status: 200, dur: 33, key: "Dashboard Web", time: "14:54:22", ip: "196.188.x.x" },
  { method: "GET", ep: "/api/v1/buildings/1/devices", status: 200, dur: 55, key: "Gateway RPi", time: "14:53:47", ip: "10.0.0.12" },
  { method: "DELETE", ep: "/api/v1/automations/r3", status: 403, dur: 6, key: "ERP Immo", time: "14:52:11", ip: "102.22.x.x" },
];

const ApiDashboardPage = (): JSX.Element => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState("full");
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState("");
  const [logMethod, setLogMethod] = useState("__all__");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/api-keys");
        setKeys(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const generateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await api.post("/api/v1/api-keys", { name: newKeyName, scope: newKeyScope });
      setKeys([res.data, ...keys]);
      setShowGen(false);
      setNewKeyName("");
      setNewKeyScope("full");
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const res = await api.patch(`/api/v1/api-keys/${id}/toggle`);
      setKeys(prev => prev.map(k => (k.id === id ? { ...k, ...res.data } : k)));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLogs = mockLogs.filter(l => {
    if (logMethod !== "__all__" && l.method !== logMethod) return false;
    if (logFilter && !l.ep.toLowerCase().includes(logFilter.toLowerCase()) && !l.key.toLowerCase().includes(logFilter.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard API</h1>
        <p className="text-muted-foreground">Gestion des clés API, logs et monitoring</p>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">Clés API ({keys.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs requêtes ({filteredLogs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{keys.filter(k => k.isActive).length} active(s) / {keys.length} totale(s)</p>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden w-48">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(keys.filter(k => k.isActive).length / Math.max(1, keys.length)) * 100}%` }} />
              </div>
            </div>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowGen(true)}>+ Nouvelle clé</Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Nom</th>
                  <th className="p-3 text-left">Clé</th>
                  <th className="p-3 text-left">Portée</th>
                  <th className="p-3 text-left">Utilisation</th>
                  <th className="p-3 text-left">Statut</th>
                  <th className="p-3 text-left">Dernier appel</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Aucune clé API générée.</td></tr>
                )}
                {keys.map(k => (
                  <tr key={k.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-medium">{k.name}</td>
                    <td className="p-3"><span className="font-mono text-xs bg-muted px-2 py-1 rounded">{k.key}</span></td>
                    <td className="p-3"><Badge variant="outline">{k.scope === "full" ? "Complet" : k.scope === "read" ? "Lecture" : k.scope === "write" ? "Écriture" : "Gateway"}</Badge></td>
                    <td className="p-3">
                      <div className="text-xs font-medium">{k.requests.toLocaleString()} / {k.limit.toLocaleString()}</div>
                      <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden w-28">
                        <div className={`h-full rounded-full ${k.requests / k.limit > 0.8 ? "bg-red-500" : k.requests / k.limit > 0.6 ? "bg-orange-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (k.requests / k.limit) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="p-3"><Badge variant={k.isActive ? "default" : "destructive"}>{k.isActive ? "Actif" : "Révoqué"}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{k.lastUsed ? new Date(k.lastUsed).toLocaleString() : "Jamais"}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="icon" onClick={() => toggleStatus(k.id)} title={k.isActive ? "Révoquer" : "Réactiver"}>
                        {k.isActive ? "✕" : "↩"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Input placeholder="Filtrer par endpoint ou clé..." className="max-w-xs" value={logFilter} onChange={e => setLogFilter(e.target.value)} />
            <Select value={logMethod} onValueChange={setLogMethod}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Méthode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            {(logFilter || logMethod !== "__all__") && <Button variant="ghost" size="sm" onClick={() => { setLogFilter(""); setLogMethod("__all__"); }}>Réinitialiser</Button>}
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Méthode</th>
                  <th className="p-3 text-left">Endpoint</th>
                  <th className="p-3 text-left">Statut</th>
                  <th className="p-3 text-left">Durée</th>
                  <th className="p-3 text-left">Clé</th>
                  <th className="p-3 text-left">IP</th>
                  <th className="p-3 text-left">Heure</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Aucun log trouvé.</td></tr>
                )}
                {filteredLogs.map((l, i) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    <td className="p-3"><Badge variant="outline" className={`font-mono ${l.method === "GET" ? "bg-emerald-500/10 text-emerald-400" : l.method === "POST" ? "bg-blue-500/10 text-blue-400" : l.method === "PATCH" ? "bg-purple-500/10 text-purple-400" : "bg-red-500/10 text-red-400"}`}>{l.method}</Badge></td>
                    <td className="p-3 font-mono text-xs">{l.ep}</td>
                    <td className="p-3"><span className={l.status >= 400 ? "text-red-400" : l.status >= 300 ? "text-orange-400" : "text-emerald-400"}>{l.status}</span></td>
                    <td className="p-3"><Badge variant={l.dur < 50 ? "default" : l.dur < 150 ? "secondary" : "destructive"} className="text-xs">{l.dur}ms</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{l.key}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{l.ip}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{l.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Générer une clé */}
      <Dialog open={showGen} onOpenChange={setShowGen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Générer une nouvelle clé API</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="keyName">Nom de la clé</Label>
              <Input id="keyName" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="ex: Integration ERP Immo" />
            </div>
            <div>
              <Label>Portée (scope)</Label>
              <Select value={newKeyScope} onValueChange={setNewKeyScope}>
                <SelectTrigger><SelectValue placeholder="Scope" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Accès complet</SelectItem>
                  <SelectItem value="read">Lecture seule</SelectItem>
                  <SelectItem value="write">Lecture + Écriture</SelectItem>
                  <SelectItem value="gateway">Gateway uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowGen(false)}>Annuler</Button>
            <Button onClick={generateKey} className="bg-emerald-600 hover:bg-emerald-700">Générer la clé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiDashboardPage;
