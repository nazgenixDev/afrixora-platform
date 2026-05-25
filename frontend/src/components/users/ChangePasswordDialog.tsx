"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import useStore from "@/store";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ open, onOpenChange }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearAuth = useStore(state => state.clearAuth);

  const handleSubmit = async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Les nouveaux mots de passe ne correspondent pas");
      return;
    }
    if (newPassword.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères");
      return;
    }
    setLoading(true);
    try {
      await api.patch("/api/v1/users/change-password", {
        currentPassword,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        clearAuth();
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur lors du changement de mot de passe");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) resetForm(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
          <DialogDescription>
            Vous serez déconnecté après le changement.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="text-center py-4 space-y-2">
            <div className="text-emerald-400 font-semibold">Mot de passe modifié avec succès !</div>
            <p className="text-sm text-muted-foreground">Redirection vers la page de connexion...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Mot de passe actuel</Label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div>
              <Label>Confirmer</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {error && (
              <div className="p-3 text-sm bg-red-500/10 text-red-400 rounded-md">{error}</div>
            )}
          </div>
        )}

        {!success && (
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Modification..." : "Changer le mot de passe"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;
