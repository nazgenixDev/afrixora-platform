"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { User, Lock, Bell, Sun, Moon, Save, Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import useStore from "@/store";
import api from "@/lib/api";

const NOTIFICATIONS_KEY = "afrixora_notifications";

// ─── Sous-composant Profil ───────────────────────────────────
const ProfileTab = () => {
  const user = useStore((s) => s.user);
  const setAuth = useStore((s) => s.setAuth);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Le nom et l'email sont requis.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.patch("/api/v1/users/me", { name, email });
      const updatedUser = res.data.user;
      // Mise à jour du store Zustand
      setAuth(updatedUser, null);
      setDirty(false);
      toast.success("Profil mis à jour avec succès !");
    } catch (err: any) {
      const msg = err.response?.data?.error || "Erreur lors de la mise à jour du profil.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const hasChanged = name !== user?.name || email !== user?.email;

  return (
    <Card className="card-hover">
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-brand-500" />
          <div>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>Modifiez votre nom et votre adresse email</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nom complet</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              placeholder="Votre nom"
              className="transition-all duration-200 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Adresse email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
              placeholder="vous@exemple.com"
              className="transition-all duration-200 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Badge variant="outline" className="text-xs px-3 py-1 border-brand-500/30 text-brand-600 dark:text-brand-400">
            {user?.role === "SUPER_ADMIN" ? "Super Administrateur" :
             user?.role === "TENANT_ADMIN" ? "Administrateur Client" :
             user?.role === "BUILDING_ADMIN" ? "Administrateur Bâtiment" :
             user?.role === "OPERATOR" ? "Opérateur" : "Lecteur"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN"
              ? "Accès complet à la plateforme"
              : "Accès limité selon votre rôle"}
          </span>
        </div>

        <Separator />

        <Button
          onClick={handleSave}
          disabled={!hasChanged || loading}
          className="gap-2 transition-all duration-200"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {loading ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Sous-composant Sécurité ─────────────────────────────────
const SecurityTab = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async () => {
    // Validations
    if (!currentPassword) {
      toast.error("Veuillez saisir votre mot de passe actuel.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }

    setLoading(true);
    try {
      await api.patch("/api/v1/users/change-password", {
        currentPassword,
        newPassword,
      });
      toast.success("Mot de passe modifié avec succès !");
      reset();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Erreur lors du changement de mot de passe.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-hover">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-brand-500" />
          <div>
            <CardTitle>Sécurité</CardTitle>
            <CardDescription>Changez votre mot de passe actuel</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="current-password">Mot de passe actuel</Label>
          <Input
            id="current-password"
            type={showPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Votre mot de passe actuel"
            className="transition-all duration-200 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              className="transition-all duration-200 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retaper le nouveau mot de passe"
              className="transition-all duration-200 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        {/* Indicateur de force du mot de passe */}
        {newPassword && (
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className={`h-3.5 w-3.5 ${newPassword.length >= 6 ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span className={newPassword.length >= 6 ? "text-emerald-500" : "text-muted-foreground"}>
              {newPassword.length >= 6 ? "Mot de passe valide" : `Minimum 6 caractères (${newPassword.length}/6)`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="rounded"
            />
            Afficher les mots de passe
          </label>
        </div>

        <Separator />

        <Button
          onClick={handleChangePassword}
          disabled={loading}
          className="gap-2 transition-all duration-200"
          variant="default"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {loading ? "Modification..." : "Changer le mot de passe"}
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Sous-composant Notifications ────────────────────────────
const NotificationsTab = () => {
  const [emailAlerts, setEmailAlerts] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    if (stored !== null) {
      setEmailAlerts(stored === "true");
    }
  }, []);

  const toggleEmailAlerts = (checked: boolean) => {
    setEmailAlerts(checked);
    localStorage.setItem(NOTIFICATIONS_KEY, String(checked));
    toast.success(checked
      ? "Notifications email activées"
      : "Notifications email désactivées"
    );
  };

  return (
    <Card className="card-hover">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-brand-500" />
          <div>
            <CardTitle>Préférences de notifications</CardTitle>
            <CardDescription>Gérez comment vous recevez les alertes et notifications</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border p-4 transition-all duration-200 hover:bg-accent/30">
          <div className="space-y-0.5">
            <Label htmlFor="email-alerts" className="text-sm font-medium cursor-pointer">
              Alertes par email
            </Label>
            <p className="text-xs text-muted-foreground">
              Recevez une notification par email en cas d'alerte critique ou d'événement important
            </p>
          </div>
          <Switch
            id="email-alerts"
            checked={emailAlerts}
            onCheckedChange={toggleEmailAlerts}
          />
        </div>

        <Separator />

        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Info :</strong> Ces préférences sont stockées localement sur votre navigateur.
            Les notifications email seront effectives lors de votre prochaine connexion.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Sous-composant Apparence ────────────────────────────────
const AppearanceTab = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Éviter l'hydratation mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Card className="card-hover">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-brand-500" />
            <div>
              <CardTitle>Apparence</CardTitle>
              <CardDescription>Personnalisez l'apparence de votre interface</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-20 skeleton" />
        </CardContent>
      </Card>
    );
  }

  const isDark = theme === "dark";

  return (
    <Card className="card-hover">
      <CardHeader>
        <div className="flex items-center gap-2">
          {isDark ? (
            <Moon className="h-5 w-5 text-brand-500" />
          ) : (
            <Sun className="h-5 w-5 text-brand-500" />
          )}
          <div>
            <CardTitle>Apparence</CardTitle>
            <CardDescription>Personnalisez l'apparence de votre interface</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border p-4 transition-all duration-200 hover:bg-accent/30">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium cursor-pointer">Thème</Label>
            <p className="text-xs text-muted-foreground">
              Basculez entre le mode clair et le mode sombre
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground capitalize">
              {isDark ? "Sombre" : "Clair"}
            </span>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </div>

        {/* Aperçu visuel */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme("light")}
            className={`relative rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-md ${
              !isDark ? "border-brand-500 bg-accent/20" : "border-border hover:border-brand-500/50"
            }`}
          >
            <Sun className="h-5 w-5 mb-2 text-amber-500" />
            <p className="text-xs font-medium">Clair</p>
            <p className="text-[10px] text-muted-foreground">Fond clair</p>
            {!isDark && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500" />
            )}
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`relative rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-md ${
              isDark ? "border-brand-500 bg-accent/20" : "border-border hover:border-brand-500/50"
            }`}
          >
            <Moon className="h-5 w-5 mb-2 text-indigo-400" />
            <p className="text-xs font-medium">Sombre</p>
            <p className="text-[10px] text-muted-foreground">Fond sombre</p>
            {isDark && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500" />
            )}
          </button>
        </div>

        <Separator />

        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Info :</strong> Le thème sélectionné est sauvegardé automatiquement et appliqué
            sur toutes les pages de l'application.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Page principale ─────────────────────────────────────────
const SettingsPage = (): JSX.Element => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* En-tête */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Paramètres
        </h1>
        <p className="text-muted-foreground">
          Gérez votre compte, votre sécurité et vos préférences
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Sécurité</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Sun className="h-4 w-4" />
            <span className="hidden sm:inline">Apparence</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 animate-in fade-in-50 duration-300">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="security" className="space-y-4 animate-in fade-in-50 duration-300">
          <SecurityTab />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 animate-in fade-in-50 duration-300">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4 animate-in fade-in-50 duration-300">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
