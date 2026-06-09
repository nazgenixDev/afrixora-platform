"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore from "@/store";
import ChangePasswordDialog from "@/components/users/ChangePasswordDialog";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "TENANT_ADMIN", label: "Admin Tenant" },
  { value: "BUILDING_ADMIN", label: "Admin Bâtiment" },
  { value: "OPERATOR", label: "Opérateur" },
  { value: "VIEWER", label: "Lecteur" },
];

const UsersPage = (): JSX.Element => {
  const user = useStore(state => state.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "TENANT_ADMIN", password: "" });

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/v1/users");
      const raw = res.data;
      setUsers(Array.isArray(raw) ? raw : (raw?.data ?? []));
    } catch (err) {
      logger.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    if (!form.email || !form.name || !form.password) return;
    setCreateError(null); // Effacer l'erreur précédente
    try {
      await api.post("/api/v1/users", form);
      setShowAdd(false);
      setForm({ email: "", name: "", role: "TENANT_ADMIN", password: "" });
      setCreateError(null);
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || "Erreur lors de la création");
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const res = await api.patch(`/api/v1/users/${id}/toggle`);
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, isActive: res.data.isActive } : u)));
    } catch (err) {
      logger.error(String(err));
    }
  };

  const changeRole = async (id: string, role: string) => {
    try {
      await api.patch(`/api/v1/users/${id}/role`, { role });
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));
    } catch (err) {
      logger.error(String(err));
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword || newPassword.length < 6) {
      setResetError("Le mot de passe doit faire au moins 6 caractères");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await api.patch(`/api/v1/users/${resetTarget.id}/reset-password`, { newPassword });
      setResetSuccess(true);
      setTimeout(() => {
        setResetTarget(null);
        setNewPassword("");
        setResetSuccess(false);
        setResetError(null);
      }, 2000);
    } catch (err: any) {
      setResetError(err.response?.data?.error || "Erreur lors de la réinitialisation");
    } finally {
      setResetLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/v1/users/${deleteTarget.id}`);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || "Erreur lors de la suppression");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Effacer l'erreur quand on ferme/ouvre le dialogue d'ajout
  const openAddDialog = () => {
    setCreateError(null);
    setShowAdd(true);
  };
  const closeAddDialog = () => {
    setShowAdd(false);
    setCreateError(null);
  };

  if (!user || !['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Accès réservé aux administrateurs</p>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground">{users.length} utilisateur(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowChangePassword(true)}>🔑 Mon mot de passe</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openAddDialog}>+ Nouvel utilisateur</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">Nom</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Rôle</th>
                <th className="p-3 text-left">Statut</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    <Select defaultValue={u.role} onValueChange={(role) => changeRole(u.id, role)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Badge variant={u.isActive ? "default" : "destructive"}>
                      {u.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(u.id)}>
                        {u.isActive ? "Désactiver" : "Activer"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setResetTarget(u); setNewPassword(""); setResetError(null); setResetSuccess(false); }}>
                        🔄 Mot de passe
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(u); setDeleteError(null); }}>
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog ajouter */}
      <Dialog open={showAdd} onOpenChange={(open) => open ? openAddDialog() : closeAddDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel utilisateur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Mot de passe</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Rôle</Label>
              <Select value={form.role} onValueChange={role => setForm({ ...form, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {createError && <div className="p-3 text-sm bg-red-500/10 text-red-400 rounded-md">{createError}</div>}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeAddDialog}>Annuler</Button>
            <Button onClick={handleCreate}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog réinitialiser mot de passe */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Réinitialiser le mot de passe de {resetTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {resetSuccess ? (
              <div className="text-emerald-400 font-semibold text-center py-4">Mot de passe réinitialisé avec succès !</div>
            ) : (
              <>
                <div><Label>Nouveau mot de passe</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                {resetError && <div className="p-3 text-sm bg-red-500/10 text-red-400 rounded-md">{resetError}</div>}
              </>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setResetTarget(null)}>Annuler</Button>
            {!resetSuccess && <Button onClick={handleResetPassword} disabled={resetLoading}>{resetLoading ? "Réinitialisation..." : "Réinitialiser"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog supprimer */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'utilisateur</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <div className="p-3 text-sm bg-red-500/10 text-red-400 rounded-md">{deleteError}</div>}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>{deleteLoading ? "Suppression..." : "Supprimer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
    </div>
  );
};

export default UsersPage;
