import { Injectable } from '@angular/core';
import { TURNO_ESTADO_LABELS } from '../models';

export interface ReporteTurnoRow {
  turno_id: string;
  fecha: string;
  cliente: string;
  profesional: string;
  servicio: string;
  precio: number;
  estado: string;
  origen: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  async exportPdf(rows: ReporteTurnoRow[], titulo: string): Promise<void> {
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableModule.default;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(titulo, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 26);

    autoTable(doc, {
      startY: 32,
      head: [['Fecha', 'Cliente', 'Profesional', 'Servicio', 'Precio', 'Estado', 'Origen']],
      body: rows.map((r) => [
        new Date(r.fecha).toLocaleString('es-AR'),
        r.cliente,
        r.profesional,
        r.servicio,
        `$${Number(r.precio).toLocaleString('es-AR')}`,
        TURNO_ESTADO_LABELS[r.estado as keyof typeof TURNO_ESTADO_LABELS] ?? r.estado,
        r.origen,
      ]),
    });

    doc.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
  }

  async exportExcel(rows: ReporteTurnoRow[], titulo: string): Promise<void> {
    const XLSX = await import('xlsx');

    const data = rows.map((r) => ({
      Fecha: new Date(r.fecha).toLocaleString('es-AR'),
      Cliente: r.cliente,
      Profesional: r.profesional,
      Servicio: r.servicio,
      Precio: r.precio,
      Estado: TURNO_ESTADO_LABELS[r.estado as keyof typeof TURNO_ESTADO_LABELS] ?? r.estado,
      Origen: r.origen,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
    XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
  }
}
