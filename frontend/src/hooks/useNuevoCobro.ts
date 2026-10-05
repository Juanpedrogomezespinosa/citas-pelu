/**
 * Estado del cobro en caja: líneas (servicios de la cita, servicios sueltos y
 * productos), descuento y método de pago. Los precios que se muestran son
 * orientativos: el servidor los recalcula y es quien manda.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Cita, Cobro, MetodoPago, Producto, Servicio } from '../lib/types';
import { useAction } from './useAction';
import { useAsync } from './useAsync';

export interface LineaBorrador {
  clave: string;
  tipo: 'servicio' | 'producto';
  refId: number;
  descripcion: string;
  cantidad: number;
  precio: number;
  /** Las líneas de la cita no se pueden quitar ni cambiar de cantidad */
  deCita: boolean;
}

export function useNuevoCobro(citaId: number | null) {
  const cita = useAsync(() => api.citas.get(citaId ?? 0), [citaId], { enabled: citaId !== null });
  const catalogo = useAsync(() => Promise.all([api.servicios.list(), api.productos.list()]), []);

  const [lineas, setLineas] = useState<LineaBorrador[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [metodo, setMetodo] = useState<MetodoPago>('tarjeta');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [cobrado, setCobrado] = useState<Cobro | null>(null);

  // Precarga los servicios de la cita
  useEffect(() => {
    const c: Cita | null = cita.data;
    if (!c) return;
    setLineas(
      c.servicios.map((s) => ({
        clave: `cita-${s.servicio_id}`,
        tipo: 'servicio',
        refId: s.servicio_id,
        descripcion: s.nombre,
        cantidad: 1,
        precio: s.precio,
        deCita: true,
      })),
    );
  }, [cita.data]);

  const agregarServicio = useCallback((s: Servicio) => {
    setLineas((ls) => [
      ...ls,
      {
        clave: `s-${s.id}-${Date.now()}`,
        tipo: 'servicio',
        refId: s.id,
        descripcion: s.nombre,
        cantidad: 1,
        precio: s.precio,
        deCita: false,
      },
    ]);
  }, []);

  const agregarProducto = useCallback((p: Producto) => {
    setLineas((ls) => {
      const existente = ls.find((l) => l.tipo === 'producto' && l.refId === p.id);
      if (existente) return ls.map((l) => (l === existente ? { ...l, cantidad: Math.min(l.cantidad + 1, p.stock) } : l));
      return [
        ...ls,
        { clave: `p-${p.id}`, tipo: 'producto', refId: p.id, descripcion: p.nombre, cantidad: 1, precio: p.precio, deCita: false },
      ];
    });
  }, []);

  const cambiarCantidad = (clave: string, cantidad: number) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(1, Math.min(99, cantidad)) } : l)));
  const quitar = (clave: string) => setLineas((ls) => ls.filter((l) => l.clave !== clave));

  const subtotal = useMemo(() => Math.round(lineas.reduce((t, l) => t + l.cantidad * l.precio, 0) * 100) / 100, [lineas]);
  const total = Math.max(0, Math.round((subtotal - descuento) * 100) / 100);

  const guardar = useAction(() =>
    api.cobros.create({
      ...(citaId ? { cita_id: citaId } : { cliente_id: clienteId }),
      metodo,
      descuento,
      notas,
      lineas: lineas.map((l) =>
        l.tipo === 'servicio'
          ? { tipo: 'servicio', servicio_id: l.refId, cantidad: l.cantidad }
          : { tipo: 'producto', producto_id: l.refId, cantidad: l.cantidad },
      ),
    }),
  );

  const cobrar = async () => {
    const r = await guardar.run();
    if (r) setCobrado(r);
  };

  return {
    cita,
    servicios: catalogo.data?.[0] ?? [],
    productos: catalogo.data?.[1] ?? [],
    cargando: cita.loading || catalogo.loading,
    errorCarga: cita.error ?? catalogo.error,
    lineas,
    agregarServicio,
    agregarProducto,
    cambiarCantidad,
    quitar,
    descuento,
    setDescuento,
    metodo,
    setMetodo,
    clienteId,
    setClienteId,
    notas,
    setNotas,
    subtotal,
    total,
    cobrar,
    guardando: guardar.pending,
    error: guardar.error,
    cobrado,
  };
}
