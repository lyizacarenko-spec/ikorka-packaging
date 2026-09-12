import { useEffect, useState } from "react";
import { api } from "./api";
import type { Manager, SalesChannel, ProductLine, BoxType, Material, Period } from "./types";

/** Loads the reference tables every page needs (managers, channels, product
 * lines, box types, materials, periods) once, and exposes a refetch. */
export function useReferenceData() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [boxTypes, setBoxTypes] = useState<BoxType[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const [m, c, pl, bt, mat, p] = await Promise.all([
      api.get<Manager[]>("/managers"),
      api.get<SalesChannel[]>("/sales-channels"),
      api.get<ProductLine[]>("/product-lines"),
      api.get<BoxType[]>("/box-types"),
      api.get<Material[]>("/materials"),
      api.get<Period[]>("/periods"),
    ]);
    setManagers(m);
    setChannels(c);
    setProductLines(pl);
    setBoxTypes(bt);
    setMaterials(mat);
    setPeriods(p);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { managers, channels, productLines, boxTypes, materials, periods, loading, reload };
}
