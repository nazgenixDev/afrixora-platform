"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import useStore from "@/store";

const SettingsPage = (): JSX.Element => {
  const user = useStore(state => state.user);
  const [name, setName] = useState(user?.name || "");
  const [theme, setTheme] = useState("dark");
  const [language, setLanguage] = useState("fr");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérez votre compte et les préférences de votre espace</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="appearance">Apparence</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="about">À propos</TabsTrigger>
        </TabsList>

        {/* PROFIL */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
              <CardDescription>Modifiez votre nom et votre adresse email</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nom</Label>
                  <Input value={user?.name || ""} disabled className="opacity-60" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={user?.email || ""} disabled className="opacity-60" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Pour modifier vos informations, contactez votre administrateur.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mot de passe</CardTitle>
              <CardDescription>Changez votre mot de passe actuel</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => window.location.href = "/users"}>
                🔑 Changer le mot de passe
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rôle & Permissions</CardTitle>
              <CardDescription>Votre niveau d'accès actuel</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Badge variant="default" className="text-sm px-3 py-1">
                  {user?.role === "SUPER_ADMIN" ? "Super Administrateur" :
                   user?.role === "TENANT_ADMIN" ? "Administrateur Client" :
                   user?.role === "BUILDING_ADMIN" ? "Administrateur Bâtiment" :
                   user?.role === "OPERATOR" ? "Opérateur" : "Lecteur"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN" 
                    ? "Accès complet à la plateforme" 
                    : "Accès limité selon votre rôle"}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* APPARENCE */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Thème</CardTitle>
              <CardDescription>Personnalisez l'apparence de votre interface</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mode d'affichage</Label>
                  <p className="text-sm text-muted-foreground">Thème sombre activé par défaut</p>
                </div>
                <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                  🌙 Sombre
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground italic">
                La sélection de thème sera disponible dans une prochaine mise à jour.
              </p>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Langue</Label>
                  <p className="text-sm text-muted-foreground">Langue de l'interface</p>
                </div>
                <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                  🇫🇷 Français
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground italic">
                La sélection de langue sera disponible dans une prochaine mise à jour.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Préférences de notifications</CardTitle>
              <CardDescription>Gérez comment vous recevez les alertes</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Cette fonctionnalité sera disponible dans une prochaine mise à jour.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* À PROPOS */}
        <TabsContent value="about" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AFRIXORA</CardTitle>
              <CardDescription>Global IoT Intelligence Platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>v0.3.0 (MVP)</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Éditeur</span>
                <span>NAZGENIX SAS</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Localisation</span>
                <span>Lubumbashi, RDC</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span>admin@afrixora.cd</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Site web</span>
                <span>afrixora.cd</span>
              </div>
              <Separator />
              <div className="text-center text-muted-foreground mt-4">
                © 2026 NAZGENIX SAS — Tous droits réservés
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
