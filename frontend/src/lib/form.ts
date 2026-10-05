/** Valor de texto de un campo de formulario (FormData también puede contener ficheros) */
export function campo(datos: FormData, nombre: string, porDefecto = ''): string {
  const valor = datos.get(nombre);
  return typeof valor === 'string' ? valor : porDefecto;
}
