"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Building2, Plus, Trash2, Home, MapPin, Layers, Cpu, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import useStore from "@/store";
import logger from "@/lib/logger";

interface Building {
  id: string; name: string; address: string; city: string; unitsCount: number; isActive: boolean; _count?: { zones: number; devices: number };
}

const BuildingsPage = (): JSX.Element => {
  const user = useStore(state => state.user);
  const canEdit = user && ['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN'].includes(user.role);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Building | null>(null);
  const [formName, setFormName] = useState(""); const [formAddress, setFormAddress] = useState(""); const [formCity, setFormCity] = useState("Lubumbashi"); const [formUnits, setFormUnits] = useState(0);

  const fetchBuildings = async () => { try { setIsLoading(true); const response = await api.get('/api/v1/buildings'); const raw = response.data; setBuildings(Array.isArray(raw) ? raw : (raw?.data ?? [])); setError(null); } catch (err) { setError('Erreur de chargement des bâtiments.'); } finally { setIsLoading(false); } };
  useEffect(() => { fetchBuildings(); }, []);

  const handleAdd = async () => { if (!formName || !formAddress) return; try { await api.post('/api/v1/buildings', { name: formName, address: formAddress, city: formCity, unitsCount: formUnits || 0 }); setShowAdd(false); setFormName(""); setFormAddress(""); setFormCity("Lubumbashi"); setFormUnits(0); fetchBuildings(); } catch (err) { logger.error("Erreur ajout bâtiment", err); } };

  const handleDelete = async () => { if (!deleteTarget) return; try { await api.delete(`/api/v1/buildings/${deleteTarget.id}`); setBuildings(prev => prev.filter(b => b.id !== deleteTarget.id)); setDeleteTarget(null); } catch (err) { logger.error("Erreur suppression bâtiment", err); } };

  if (isLoading) return (
    <div className="space-y-6 animate-fade-in">
      <div className="skeleton h-8 w-48 mb-2" />
      <div className="skeleton h-4 w-32" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1,2,3].map(i => <div key={i} className="skeleton h-44 rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6 bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 rounded-xl">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Erreur</h2>
      <p className="text-red-600 dark:text-red-300">{error}</p>
      <Button variant="outline" className="mt-4" onClick={fetchBuildings}>Réessayer</Button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bâtiments</h1>
          <p className="text-muted-foreground flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            {buildings.length} bâtiment{buildings.length > 1 ? 's' : ''} enregistré{buildings.length > 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/20" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un bâtiment
          </Button>
        )}
      </div>

      {/* Empty state */}
      {buildings.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border-2 border-dashed rounded-xl bg-muted/10 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Aucun bâtiment</h3>
          <p className="text-muted-foreground mb-6">Commencez par ajouter votre premier bâtiment.</p>
          {canEdit && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un bâtiment
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building, idx) => (
            <Card
              key={building.id}
              className="overflow-hidden group hover:shadow-lg transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              {/* Top gradient bar */}
              <div className={`h-1.5 w-full ${building.isActive ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-muted'}`} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${building.isActive ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      <Home className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg truncate max-w-[180px]">{building.name}</CardTitle>
                    </div>
                  </div>
                  <Badge variant={building.isActive ? "default" : "secondary"} className="text-xs">
                    {building.isActive ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3 space-y-3">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div className="truncate">
                    <span>{building.address}</span>
                    {building.city && <span>, {building.city}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Layers className="w-3 h-3" />
                    {building._count?.zones || 0} zone{(building._count?.zones || 0) > 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Cpu className="w-3 h-3" />
                    {building._count?.devices || 0} appareil{(building._count?.devices || 0) > 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 pt-2 border-t border-border/50">
                <Button asChild variant="default" className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  <Link href={`/buildings/${building.id}`}>
                    Voir détails
                    <ArrowRight className="w-3.5 h-3.5 ml-2" />
                  </Link>
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => setDeleteTarget(building)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-500" />
              Nouveau bâtiment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" placeholder="Ex: Immeuble AFRIXORA" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" placeholder="123 Avenue de la République" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" value={formCity} onChange={(e) => setFormCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="units">Unités</Label>
                <Input id="units" type="number" min="0" value={formUnits} onChange={(e) => setFormUnits(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={!formName || !formAddress} className="bg-emerald-600 hover:bg-emerald-700">
              Créer le bâtiment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="w-5 h-5" />
              Supprimer le bâtiment
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement <strong>{deleteTarget?.name}</strong> ?
              <br />
              Cette action est irréversible et supprimera toutes les zones et appareils associés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BuildingsPage;
