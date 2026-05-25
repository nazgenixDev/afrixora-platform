"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import api from "@/lib/api";

interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  unitsCount: number;
  isActive: boolean;
  _count?: { zones: number; devices: number };
}

const BuildingsPage = (): JSX.Element => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("Lubumbashi");
  const [formUnits, setFormUnits] = useState(0);

  const fetchBuildings = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/v1/buildings');
      setBuildings(response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load buildings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  const handleAdd = async () => {
    if (!formName || !formAddress) return;
    try {
      await api.post('/api/v1/buildings', {
        name: formName,
        address: formAddress,
        city: formCity,
        unitsCount: formUnits || 0,
      });
      setShowAdd(false);
      setFormName("");
      setFormAddress("");
      setFormCity("Lubumbashi");
      setFormUnits(0);
      fetchBuildings();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  if (error) return <div className="p-6 bg-red-50 border border-red-200 rounded-md"><h2 className="text-lg font-semibold text-red-700">Erreur</h2><p className="text-red-600">{error}</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bâtiments</h1>
          <p className="text-muted-foreground">{buildings.length} bâtiment(s) enregistré(s)</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAdd(true)}>
          + Ajouter un bâtiment
        </Button>
      </div>

      {buildings.length === 0 ? (
        <div className="text-center p-12 border rounded-md bg-muted/10">
          <h3 className="text-lg font-medium">Aucun bâtiment</h3>
          <p className="text-muted-foreground mt-2">Ajoutez votre premier bâtiment.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building) => {
            const totalDevices = building._count?.devices || 0;
            const totalZones = building._count?.zones || 0;
            const status = building.isActive ? "Actif" : "Inactif";
            
            return (
              <Card key={building.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl truncate">{building.name}</CardTitle>
                </CardHeader>
                <CardContent className="pb-2 space-y-2">
                  <div className="text-sm text-muted-foreground">
                    <div>{building.address}</div>
                    <div>{building.city}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{totalZones} zone(s)</Badge>
                    <Badge variant="outline">{totalDevices} appareil(s)</Badge>
                    <Badge variant={building.isActive ? "default" : "secondary"}>
                      {status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {building.unitsCount || 0} unité(s)
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/buildings/${building.id}`}>Voir détails</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Ajouter */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau bâtiment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Nom</Label>
              <Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={formCity} onChange={(e) => setFormCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="units">Nombre d'unités</Label>
              <Input id="units" type="number" value={formUnits} onChange={(e) => setFormUnits(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={!formName || !formAddress}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BuildingsPage;