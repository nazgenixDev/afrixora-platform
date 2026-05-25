"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import useStore from "@/store";

interface Automation {
  id: string;
  tenantId: string;
  buildingId: string;
  name: string;
  isActive: boolean;
  trigger: any;
  conditions: any[];
  action: any;
  lastFiredAt: string | null;
  createdAt: string;
}

interface Building {
  id: string;
  name: string;
}

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  eq: "=",
  gte: "≥",
  lte: "≤",
};

const AutomationsPage = () => {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewRule, setShowNewRule] = useState(false);
  
  const [formName, setFormName] = useState("");
  const [formBuildingId, setFormBuildingId] = useState("");
  const [triggerDeviceId, setTriggerDeviceId] = useState("");
  const [triggerMetric, setTriggerMetric] = useState("power_w");
  const [triggerOperator, setTriggerOperator] = useState("gt");
  const [triggerValue, setTriggerValue] = useState(100);
  const [actionType, setActionType] = useState<"DEVICE_COMMAND" | "SEND_ALERT">("SEND_ALERT");
  const [actionCommand, setActionCommand] = useState("set_state");
  const [actionParams, setActionParams] = useState('{"state":"off"}');
  const [actionSeverity, setActionSeverity] = useState("WARNING");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<any[]>([]);

  const user = useStore(state => state.user);

  useEffect(() => {
    (async () => {
      try {
        const [aRes, bRes, dRes] = await Promise.all([
          api.get("/api/v1/automations"),
          api.get("/api/v1/buildings"),
          api.get("/api/v1/devices"),
        ]);
        setAutomations(aRes.data || []);
        setBuildings(bRes.data || []);
        setSelectedDevices(dRes.data || []);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        setIsLoading(false);
      }
    })();
  }, []);

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/api/v1/automations/${id}`, { isActive });
      setAutomations(prev =>
        prev.map(a => (a.id === id ? { ...a, isActive } : a))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await api.delete(`/api/v1/automations/${id}`);
      setAutomations(prev => prev.filter(a => a.id !== id));
      if (selectedAutomation?.id === id) setSelectedAutomation(null);
    } catch (err) {
      console.error(err);
    }
  };

  const createAutomation = async () => {
    if (!formName || !formBuildingId) return;
    try {
      const payload = {
        name: formName,
        buildingId: formBuildingId,
        trigger: {
          deviceId: triggerDeviceId,
          metric: triggerMetric,
          operator: triggerOperator,
          value: Number(triggerValue),
        },
        conditions: [],
        action:
          actionType === "DEVICE_COMMAND"
            ? {
                type: "DEVICE_COMMAND",
                deviceId: triggerDeviceId,
                command: actionCommand,
                params: JSON.parse(actionParams || "{}"),
              }
            : {
                type: "SEND_ALERT",
                severity: actionSeverity,
                message: actionMessage || `Alerte ${formName}`,
              },
      };
      const res = await api.post("/api/v1/automations", payload);
      setAutomations(prev => [...prev, res.data]);
      setShowNewRule(false);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormBuildingId("");
    setTriggerDeviceId("");
    setTriggerMetric("power_w");
    setTriggerOperator("gt");
    setTriggerValue(100);
    setActionType("SEND_ALERT");
    setActionCommand("set_state");
    setActionParams('{"state":"off"}');
    setActionSeverity("WARNING");
    setActionMessage("");
  };

  const triggerSummary = (a: Automation) => {
    if (!a.trigger) return "N/A";
    const { metric, operator, value } = a.trigger;
    return `${metric} ${OPERATOR_LABELS[operator] || operator} ${value}`;
  };

  if (!user || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Accès réservé aux administrateurs</p>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automatisations</h1>
          <p className="text-muted-foreground">Moteur de règles SI / ET / ALORS</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { resetForm(); setShowNewRule(true); }}>
          + Nouvelle règle
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider">Règles actives</h2>
          {automations.length === 0 && (
            <div className="text-muted-foreground text-sm p-4 border rounded-md">Aucune règle configurée.</div>
          )}
          {automations.map(a => (
            <Card
              key={a.id}
              className={`cursor-pointer transition-colors hover:border-emerald-500/30 ${selectedAutomation?.id === a.id ? "border-emerald-500 ring-1 ring-emerald-500/20" : ""}`}
              onClick={() => setSelectedAutomation(a)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">SI {triggerSummary(a)}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={a.isActive ? "default" : "secondary"} className="text-xs">
                      {a.isActive ? "Actif" : "Pausé"}
                    </Badge>
                    {a.lastFiredAt && (
                      <span className="text-xs text-muted-foreground">
                        Dernier: {new Date(a.lastFiredAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={a.isActive}
                  onCheckedChange={checked => toggleActive(a.id, checked)}
                  onClick={e => e.stopPropagation()}
                  className="ml-4 flex-shrink-0"
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-2">
          {showNewRule ? (
            <Card>
              <CardHeader><CardTitle>Nouvelle règle</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Nom de la règle</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Alerte consommation" /></div>
                  <div><Label>Bâtiment</Label><Select value={formBuildingId} onValueChange={setFormBuildingId}><SelectTrigger><SelectValue placeholder="Sélectionner un bâtiment" /></SelectTrigger><SelectContent>{buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="border-t pt-4"><h3 className="text-sm font-semibold mb-3">Déclencheur (SI)</h3><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><Label>Appareil</Label><Select value={triggerDeviceId} onValueChange={setTriggerDeviceId}><SelectTrigger><SelectValue placeholder="Choisir un appareil" /></SelectTrigger><SelectContent>{selectedDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Métrique</Label><Select value={triggerMetric} onValueChange={setTriggerMetric}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="power_w">Power (W)</SelectItem><SelectItem value="temp_c">Température (°C)</SelectItem><SelectItem value="motion">Mouvement</SelectItem><SelectItem value="state">État</SelectItem></SelectContent></Select></div><div><Label>Opérateur & Valeur</Label><div className="flex gap-2"><Select value={triggerOperator} onValueChange={setTriggerOperator}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gt">&gt;</SelectItem><SelectItem value="lt">&lt;</SelectItem><SelectItem value="eq">=</SelectItem><SelectItem value="gte">≥</SelectItem><SelectItem value="lte">≤</SelectItem></SelectContent></Select><Input type="number" value={triggerValue} onChange={e => setTriggerValue(Number(e.target.value))} className="flex-1" /></div></div></div></div>
                <div className="border-t pt-4"><h3 className="text-sm font-semibold mb-3">Action (ALORS)</h3><div className="space-y-3"><div><Label>Type d'action</Label><Select value={actionType} onValueChange={e => setActionType(e as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DEVICE_COMMAND">Commande appareil</SelectItem><SelectItem value="SEND_ALERT">Envoyer une alerte</SelectItem></SelectContent></Select></div>{actionType === "DEVICE_COMMAND" && <><div><Label>Commande</Label><Select value={actionCommand} onValueChange={setActionCommand}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="set_state">set_state</SelectItem><SelectItem value="turn_on">turn_on</SelectItem><SelectItem value="turn_off">turn_off</SelectItem></SelectContent></Select></div><div><Label>Paramètres (JSON)</Label><Input value={actionParams} onChange={e => setActionParams(e.target.value)} placeholder='{"state":"on"}' /></div></>}{actionType === "SEND_ALERT" && <><div><Label>Sévérité</Label><Select value={actionSeverity} onValueChange={setActionSeverity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INFO">INFO</SelectItem><SelectItem value="WARNING">WARNING</SelectItem><SelectItem value="CRITICAL">CRITICAL</SelectItem></SelectContent></Select></div><div><Label>Message</Label><Input value={actionMessage} onChange={e => setActionMessage(e.target.value)} placeholder="Message d'alerte" /></div></>}</div></div>
                <div className="flex justify-end gap-2 pt-4 border-t"><Button variant="outline" onClick={() => setShowNewRule(false)}>Annuler</Button><Button onClick={createAutomation} disabled={!formName || !formBuildingId}>Créer</Button></div>
              </CardContent>
            </Card>
          ) : selectedAutomation ? (
            <Card>
              <CardHeader><CardTitle>{selectedAutomation.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground">Bâtiment: </span><span>{buildings.find(b => b.id === selectedAutomation.buildingId)?.name || selectedAutomation.buildingId}</span></div>
                  <div><span className="text-muted-foreground">Statut: </span><Badge variant={selectedAutomation.isActive ? "default" : "secondary"}>{selectedAutomation.isActive ? "Actif" : "Pausé"}</Badge></div>
                </div>
                <div><h3 className="font-semibold mb-1">Déclencheur</h3><pre className="bg-muted/30 p-2 rounded text-xs">{JSON.stringify(selectedAutomation.trigger, null, 2)}</pre></div>
                <div><h3 className="font-semibold mb-1">Action</h3><pre className="bg-muted/30 p-2 rounded text-xs">{JSON.stringify(selectedAutomation.action, null, 2)}</pre></div>
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => toggleActive(selectedAutomation.id, !selectedAutomation.isActive)}>{selectedAutomation.isActive ? "Désactiver" : "Activer"}</Button>
                  <Button variant="destructive" onClick={() => deleteAutomation(selectedAutomation.id)}>Supprimer</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground border rounded-lg">
              Sélectionnez une règle ou créez-en une nouvelle
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutomationsPage;
