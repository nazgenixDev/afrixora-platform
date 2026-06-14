"use client";
import { useEffect, useState } from "react";

interface Subscription {
  plan: string;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL";
  endsAt: string | null;
  limits: {
    maxDevices: number;
    maxAutomations: number;
    hasApi: boolean;
    hasExport: boolean;
    sla: string;
  };
  usage: {
    devices: number;
    automations: number;
  };
  history: any[];
}

import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, CheckCircle, XCircle, Loader2, ArrowUpCircle, Zap, Cpu, Shield, FileText } from "lucide-react";

const statusConfig = {
  ACTIVE: { label: "Actif", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  PAST_DUE: { label: "En retard", color: "bg-red-500/10 text-red-500 border-red-500/30" },
  CANCELED: { label: "Annulé", color: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  TRIAL: { label: "Essai", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
};

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("PRO");
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const fetchSubscription = async () => {
    try {
      const res = await api.get("/api/v1/tenants/current/subscription");
      setSubscription(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const handleUpgradeRequest = async () => {
    setUpgradeLoading(true);
    try {
      await api.post("/api/v1/tenants/current/upgrade-request", { requestedPlan: selectedPlan });
      toast.success("Demande envoyée avec succès");
      setTimeout(() => setUpgradeDialogOpen(false), 500);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'envoi de la demande");
    } finally {
      setUpgradeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-32" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!subscription) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center space-y-3">
        <XCircle className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">Erreur de chargement</p>
      </div>
    </div>
  );

  const formatLimit = (limit: number) => {
    if (limit === null || limit === undefined) return "Illimité";
    if (limit === Infinity) return "Illimité";
    return limit;
  };

  const deviceLimit = formatLimit(subscription.limits?.maxDevices);
  const automationLimit = formatLimit(subscription.limits?.maxAutomations);

  const deviceValue = subscription.usage?.devices ?? 0;
  const automationValue = subscription.usage?.automations ?? 0;

  const deviceRatio = subscription.limits?.maxDevices && subscription.limits.maxDevices !== Infinity
    ? deviceValue / subscription.limits.maxDevices
    : 0;
  const automationRatio = subscription.limits?.maxAutomations && subscription.limits.maxAutomations !== Infinity
    ? automationValue / subscription.limits.maxAutomations
    : 0;

  const currentStatus = statusConfig[subscription.status as keyof typeof statusConfig] || statusConfig.ACTIVE;

  const plans = [
    { name: "BASIC", price: 9, devices: 10, automations: 5, api: false, export: false, sla: "Standard" },
    { name: "PRO", price: 29, devices: 50, automations: 20, api: true, export: true, sla: "Prioritaire" },
    { name: "BUSINESS", price: 79, devices: 200, automations: "Illimité", api: true, export: true, sla: "99.5%" },
    { name: "ENTERPRISE", price: "Sur devis", devices: "Illimité", automations: "Illimité", api: true, export: true, sla: "Contractuel" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Abonnement</h1>
          <p className="text-muted-foreground">Gérez votre plan et vos limites d'utilisation</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Plan actuel */}
        <Card className="overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Plan actuel</span>
              <Badge className={currentStatus.color}>{currentStatus.label}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                  {subscription.plan}
                </span>
                {subscription.endsAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Expire le {new Date(subscription.endsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Statut</p>
                <Badge className={currentStatus.color}>{currentStatus.label}</Badge>
              </div>
            </div>

            {/* Barres de progression */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                    Appareils
                  </span>
                  <span className="font-medium">{deviceValue} / {deviceLimit}</span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      deviceRatio >= 1 ? "bg-red-500" : deviceRatio >= 0.8 ? "bg-orange-500" : "bg-gradient-to-r from-emerald-400 to-emerald-500"
                    }`}
                    style={{ width: `${Math.min(deviceRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                    Automatisations
                  </span>
                  <span className="font-medium">{automationValue} / {automationLimit}</span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      automationRatio >= 1 ? "bg-red-500" : automationRatio >= 0.8 ? "bg-orange-500" : "bg-gradient-to-r from-emerald-400 to-emerald-500"
                    }`}
                    style={{ width: `${Math.min(automationRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full group"
              onClick={() => setUpgradeDialogOpen(true)}
            >
              <ArrowUpCircle className="w-4 h-4 mr-2 group-hover:translate-y-[-1px] transition-transform" />
              Changer de plan
            </Button>
          </CardContent>
        </Card>

        {/* Fonctionnalités incluses */}
        <Card>
          <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500" />
          <CardHeader>
            <CardTitle>Fonctionnalités</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FeatureRow
              icon={<Shield className="w-4 h-4" />}
              label="API"
              value={subscription.limits?.hasApi ? "Activée" : "Non incluse"}
              enabled={subscription.limits?.hasApi}
            />
            <FeatureRow
              icon={<FileText className="w-4 h-4" />}
              label="Export CSV/PDF"
              value={subscription.limits?.hasExport ? "Activé" : "Non inclus"}
              enabled={subscription.limits?.hasExport}
            />
            <FeatureRow
              icon={<CheckCircle className="w-4 h-4" />}
              label="SLA"
              value={subscription.limits?.sla || "—"}
              enabled={true}
            />
          </CardContent>
        </Card>
      </div>

      {/* Tableau des plans */}
      <Card>
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />
        <CardHeader>
          <CardTitle>Plans disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Plan</TableHead>
                  <TableHead>Prix / mois</TableHead>
                  <TableHead>Appareils max</TableHead>
                  <TableHead>Automatisations</TableHead>
                  <TableHead className="text-center">API</TableHead>
                  <TableHead className="text-center">Export</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => {
                  const isCurrentPlan = subscription.plan === p.name;
                  return (
                    <TableRow
                      key={p.name}
                      className={`transition-all duration-200 ${
                        isCurrentPlan
                          ? "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-l-2 border-l-emerald-500"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.name}
                          {isCurrentPlan && (
                            <Badge variant="default" className="bg-emerald-500 text-white text-xs">Actuel</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">
                          {typeof p.price === 'number' ? `${p.price} USD` : p.price}
                        </span>
                      </TableCell>
                      <TableCell>{p.devices}</TableCell>
                      <TableCell>{p.automations}</TableCell>
                      <TableCell className="text-center">
                        {p.api ? <CheckIcon /> : <XIcon />}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.export ? <CheckIcon /> : <XIcon />}
                      </TableCell>
                      <TableCell>{p.sla}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de changement de plan */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              Demander un changement de plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nouveau plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRO">PRO — 29 USD/mois</SelectItem>
                  <SelectItem value="BUSINESS">BUSINESS — 79 USD/mois</SelectItem>
                  <SelectItem value="ENTERPRISE">ENTERPRISE — Sur devis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>Un administrateur examinera votre demande et vous répondra sous 24h.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleUpgradeRequest}
              disabled={upgradeLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {upgradeLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                "Envoyer la demande"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sous-composants
const FeatureRow = ({ icon, label, value, enabled }: { icon: React.ReactNode; label: string; value: string; enabled: boolean }) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
    <div className="flex items-center gap-3">
      <span className={enabled ? "text-emerald-500" : "text-muted-foreground"}>{icon}</span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
    </div>
    {enabled ? (
      <CheckCircle className="w-5 h-5 text-emerald-500" />
    ) : (
      <XCircle className="w-5 h-5 text-muted-foreground" />
    )}
  </div>
);

const CheckIcon = () => (
  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20">
    <CheckCircle className="w-4 h-4 text-emerald-500" />
  </span>
);

const XIcon = () => (
  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-500/20">
    <XCircle className="w-4 h-4 text-red-400" />
  </span>
);