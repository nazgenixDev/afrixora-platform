"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore from "@/store";

interface Tenant {
  id: string; name: string; slug: string; plan: string; isActive: boolean; createdAt: string;
  _count: { buildings: number; users: number };
}

const PLANS = ["BASIC", "PRO", "BUSINESS", "ENTERPRISE"];
const INITIAL_TENANT_FORM = { name: "", slug: "", plan: "BASIC", adminEmail: "", adminName: "", adminPassword: "" };

const TenantsPage = (): JSX.Element => {
  const user = useStore(state => state.user);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Tenant | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_TENANT_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [planChangeTarget, setPlanChangeTarget] = useState<Tenant | null>(null);
  const [planChangeValue, setPlanChangeValue] = useState<string>("");
  const [planChangeLoading, setPlanChangeLoading] = useState(false);

  const fetchTenants = async () => {
    try { const { data } = await api.get<Tenant[]>("/api/v1/tenants"); setTenants(data); } catch (err) { logger.error(String(err)); } finally { setLoading(false); }
  };
  useEffect(() => { fetchTenants(); }, []);

  const handleCreate = async (): Promise<void> => {
    if (!form.name || !form.slug || !form.adminEmail || !form.adminName || !form.adminPassword) { setCreateError("Tous les champs sont requis"); return; }
    try {
      await api.post("/api/v1/tenants", form);
      setShowAdd(false);
      setForm(INITIAL_TENANT_FORM);
      setCreateError(null);
      await fetchTenants();
    } catch (err) {
      const message = isAxiosError<{ error?: unknown }>(err) && err.response?.data?.error;
      setCreateError(typeof message === "string" ? message : "Erreur lors de la création du tenant");
    }
  };

  const activateTenant = async (id: string) => {
    setActivityError(null);
    try {
      const { data } = await api.patch<Pick<Tenant, "id" | "isActive">>(`/api/v1/tenants/${id}`, { isActive: true });
      setTenants(prev => prev.map(tenant => tenant.id === data.id ? { ...tenant, isActive: data.isActive } : tenant));
    } catch (error) {
      logger.error(String(error));
      setActivityError("Impossible d’activer le tenant.");
    }
  };

  const deactivateTenant = async () => {
    if (!deactivateTarget || deactivateLoading) return;
    setDeactivateLoading(true);
    setActivityError(null);
    try {
      await api.delete(`/api/v1/tenants/${deactivateTarget.id}`);
      setTenants(prev => prev.map(tenant => tenant.id === deactivateTarget.id ? { ...tenant, isActive: false } : tenant));
      setDeactivateTarget(null);
    } catch (error) {
      logger.error(String(error));
      setActivityError("Impossible de désactiver le tenant.");
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handlePlanChange = async () => {
    if (!planChangeTarget || !planChangeValue) return;
    setPlanChangeLoading(true);
    try {
      await api.patch(`/api/v1/tenants/${planChangeTarget.id}/plan`, { plan: planChangeValue });
      setTenants(prev => prev.map(t => (t.id === planChangeTarget.id ? { ...t, plan: planChangeValue } : t)));
      setPlanChangeTarget(null);
      setPlanChangeValue("");
    } catch (err) {
      logger.error(String(err));
    } finally {
      setPlanChangeLoading(false);
    }
  };

  if (!user || user.role !== "SUPER_ADMIN") return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Accès réservé au Super Administrateur</p></div>;
  if (loading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Tenants</h1><p className="text-muted-foreground">{tenants.length} client(s)</p></div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setCreateError(null); setShowAdd(true); }}>+ Nouveau tenant</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{tenants.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Actifs</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-emerald-400">{tenants.filter(t => t.isActive).length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Bâtiments</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{tenants.reduce((acc, t) => acc + (t._count?.buildings || 0), 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Utilisateurs</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{tenants.reduce((acc, t) => acc + (t._count?.users || 0), 0)}</div></CardContent></Card>
      </div>
      {activityError && !deactivateTarget && <p role="alert" className="text-sm text-destructive">{activityError}</p>}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-left">Nom</th><th className="p-3 text-left">Slug</th><th className="p-3 text-left">Plan</th><th className="p-3 text-left">Changer de plan</th><th className="p-3 text-left">Bâtiments</th><th className="p-3 text-left">Utilisateurs</th><th className="p-3 text-left">Statut</th><th className="p-3 text-left">Créé le</th><th className="p-3 text-left">Actions</th></tr></thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} className="border-t hover:bg-muted/20">
                <td className="p-3 font-medium">{t.name}</td><td className="p-3 text-muted-foreground font-mono text-xs">{t.slug}</td>
                <td className="p-3"><Badge variant="outline" className={t.plan==="ENTERPRISE"?"text-purple-400":t.plan==="PRO"?"text-blue-400":"text-emerald-400"}>{t.plan}</Badge></td>
                <td className="p-3">
                  <Select value={t.plan} onValueChange={(v) => { setPlanChangeTarget(t); setPlanChangeValue(v); }}>
                    <SelectTrigger className="h-8 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">{t._count?.buildings||0}</td><td className="p-3">{t._count?.users||0}</td>
                <td className="p-3"><Badge variant={t.isActive?"default":"destructive"}>{t.isActive?"Actif":"Inactif"}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {t.isActive ? (
                      <Button variant="ghost" size="sm" onClick={() => { setActivityError(null); setDeactivateTarget(t); }}>Désactiver</Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => activateTenant(t.id)}>Activer</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {/* Dialog confirmation changement de plan */}
      <Dialog open={!!planChangeTarget} onOpenChange={() => { setPlanChangeTarget(null); setPlanChangeValue(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le plan</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir changer le plan de <strong>{planChangeTarget?.name}</strong> ({planChangeTarget?.slug}) vers <strong>{planChangeValue}</strong> ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setPlanChangeTarget(null); setPlanChangeValue(""); }}>Annuler</Button>
            <Button onClick={handlePlanChange} disabled={planChangeLoading}>
              {planChangeLoading ? "Changement..." : "Confirmer le changement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ajouter */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau tenant</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div><Label>Nom du client</Label><Input value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div><div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm({...form,slug:e.target.value})} /></div></div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan} onValueChange={plan => setForm({ ...form, plan })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANS.map(plan => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-3"><Label className="mb-2 block">Administrateur</Label><div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Nom</Label><Input value={form.adminName} onChange={e => setForm({...form,adminName:e.target.value})} /></div><div><Label className="text-xs">Email</Label><Input type="email" value={form.adminEmail} onChange={e => setForm({...form,adminEmail:e.target.value})} /></div></div><div className="mt-2"><Label className="text-xs">Mot de passe</Label><Input type="password" value={form.adminPassword} onChange={e => setForm({...form,adminPassword:e.target.value})} /></div></div>
            {createError && <div className="p-3 text-sm bg-red-500/10 text-red-400 rounded-md">{createError}</div>}
          </div>
          <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button><Button onClick={handleCreate}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={open => { if (!open && !deactivateLoading) setDeactivateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver le tenant</DialogTitle>
            <DialogDescription>
              Suspendre l’accès de <strong>{deactivateTarget?.name}</strong> ({deactivateTarget?.slug}) ? Ses données seront conservées et le tenant pourra être réactivé.
            </DialogDescription>
          </DialogHeader>
          {activityError && <p role="alert" className="text-sm text-destructive">{activityError}</p>}
          <DialogFooter className="mt-4">
            <Button variant="outline" disabled={deactivateLoading} onClick={() => setDeactivateTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={deactivateTenant} disabled={deactivateLoading}>{deactivateLoading ? "Désactivation…" : "Désactiver"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantsPage;
