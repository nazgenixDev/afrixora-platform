"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import Link from "next/link";
import api from "@/lib/api";
import useStore from "@/store";

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

  const fetchBuildings = async () => { try { setIsLoading(true); const response = await api.get('/api/v1/buildings'); setBuildings(response.data); setError(null); } catch (err) { setError('Failed to load buildings.'); } finally { setIsLoading(false); } };
  useEffect(() => { fetchBuildings(); }, []);

  const handleAdd = async () => { if (!formName || !formAddress) return; try { await api.post('/api/v1/buildings', { name: formName, address: formAddress, city: formCity, unitsCount: formUnits || 0 }); setShowAdd(false); setFormName(""); setFormAddress(""); setFormCity("Lubumbashi"); setFormUnits(0); fetchBuildings(); } catch (err) { console.error(err); } };

  const handleDelete = async () => { if (!deleteTarget) return; try { await api.delete(`/api/v1/buildings/${deleteTarget.id}`); setBuildings(prev => prev.filter(b => b.id !== deleteTarget.id)); setDeleteTarget(null); } catch (err) { console.error(err); } };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  if (error) return <div className="p-6 bg-red-50 border border-red-200 rounded-md"><h2 className="text-lg font-semibold text-red-700">Erreur</h2><p className="text-red-600">{error}</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Bâtiments</h1><p className="text-muted-foreground">{buildings.length} bâtiment(s)</p></div>
        {canEdit && <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAdd(true)}>+ Ajouter un bâtiment</Button>}
      </div>
      {buildings.length === 0 ? <div className="text-center p-12 border rounded-md bg-muted/10"><h3 className="text-lg font-medium">Aucun bâtiment</h3></div> :
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building) => (
            <Card key={building.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-xl truncate">{building.name}</CardTitle></CardHeader>
              <CardContent className="pb-2 space-y-2">
                <div className="text-sm text-muted-foreground"><div>{building.address}</div><div>{building.city}</div></div>
                <div className="flex flex-wrap gap-2"><Badge variant="outline">{building._count?.zones||0} zone(s)</Badge><Badge variant="outline">{building._count?.devices||0} appareil(s)</Badge><Badge variant={building.isActive?"default":"secondary"}>{building.isActive?"Actif":"Inactif"}</Badge></div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button asChild variant="outline" className="flex-1"><Link href={`/buildings/${building.id}`}>Voir détails</Link></Button>
                {canEdit && <Button variant="destructive" size="icon" onClick={() => setDeleteTarget(building)}>🗑️</Button>}
              </CardFooter>
            </Card>
          ))}
        </div>
      }
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau bâtiment</DialogTitle></DialogHeader>
          <div className="space-y-3"><div><Label htmlFor="name">Nom</Label><Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} /></div><div><Label htmlFor="address">Adresse</Label><Input id="address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></div><div><Label htmlFor="city">Ville</Label><Input id="city" value={formCity} onChange={(e) => setFormCity(e.target.value)} /></div><div><Label htmlFor="units">Unités</Label><Input id="units" type="number" value={formUnits} onChange={(e) => setFormUnits(Number(e.target.value))} /></div></div>
          <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button><Button onClick={handleAdd} disabled={!formName||!formAddress}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer le bâtiment</DialogTitle><DialogDescription>Supprimer définitivement <strong>{deleteTarget?.name}</strong> ?</DialogDescription></DialogHeader>
          <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button><Button variant="destructive" onClick={handleDelete}>Supprimer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BuildingsPage;
