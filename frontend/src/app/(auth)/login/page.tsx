"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import api from "@/lib/api";
import useStore from "@/store";
import logger from "@/lib/logger";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useStore((state) => state.setAuth);
  const user = useStore((state) => state.user);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Rediriger si déjà connecté
  useEffect(() => {
    if (user) window.location.href = "/";
  }, [user, router]);

  // Validation email en temps réel
  const validateEmail = (value: string) => {
    if (value.length === 0) {
      setEmailError(null);
      return;
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setEmailError(isValid ? null : "Format d'email invalide");
  };

  // Validation mot de passe en temps réel
  const validatePassword = (value: string) => {
    if (value.length === 0) {
      setPasswordError(null);
      return;
    }
    setPasswordError(value.length < 3 ? "Mot de passe trop court" : null);
  };

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);

  // Validation finale
  if (!email || !password) {
    setError("Veuillez remplir tous les champs");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("Email invalide");
    return;
  }

  setLoading(true);

  try {
    const res = await api.post("/api/v1/auth/login", { email, password });
    const { user: userData, token } = res.data;

    // Stocker le token dans localStorage
    if (token) {
      localStorage.setItem("afrixora_token", token);
    }

    setAuth(userData, token || null);
      if (token) localStorage.setItem("afrixora_token", token);
    localStorage.setItem("afrixora_token", res.data.token);
    toast({
      title: "Connexion réussie",
      description: `Bienvenue, ${userData.name || userData.email}`,
      variant: "default",
    });

    window.location.href = "/";
  } catch (err: any) {
    const message =
      err?.response?.data?.message || err?.response?.data?.error || "Identifiants incorrects";
    setError(message);
    logger.error("Login error", err);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-brand-500/10 p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="relative w-52 h-16">
              <Image
                src="/afrixora_logo1.svg"
                alt="AFRIXORA"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>

        <Card className="shadow-xl border-0 bg-card/95 backdrop-blur-sm">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-xl font-bold">Connexion</CardTitle>
            <CardDescription>
              Connectez-vous pour accéder à votre tableau de bord
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Message d'erreur */}
              {error && (
                <div className="p-3 text-sm rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      validateEmail(e.target.value);
                    }}
                    className={`pl-10 ${emailError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    disabled={loading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-500">{emailError}</p>
                )}
              </div>

              {/* Mot de passe */}
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      validatePassword(e.target.value);
                    }}
                    className={`pl-10 ${passwordError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-red-500">{passwordError}</p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white shadow-lg shadow-brand-500/20 transition-all duration-200"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          AFRIXORA © {new Date().getFullYear()} — Smart Energy Management Platform
        </p>
      </div>
    </div>
  );
}
