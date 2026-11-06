export interface NavItem {
  label: string;
  href?: string; // sin href = planificado (no se muestra como link)
  phase?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Mapa de navegación de las capturas originales. Lo no implementado se muestra como planificado, nunca como link muerto. */
export const NAV: NavGroup[] = [
  { label: 'Inicio', items: [{ label: 'Command Center', href: '/' }] },
  {
    label: 'Ventas',
    items: [
      { label: 'Leads & CRM', href: '/leads' },
      { label: 'Pipeline', href: '/pipeline' },
      { label: 'Seguimientos y tareas', href: '/tasks' },
      { label: 'Cotizadores', href: '/quotes' },
      { label: 'Documentos y precios', href: '/documents' },
      { label: 'Inbox de conversaciones', phase: 'P4' },
    ],
  },
  {
    label: 'Campañas',
    items: [
      { label: 'Campaign Intelligence', href: '/campaigns' },
      { label: 'Métricas por canal', phase: 'P2' },
    ],
  },
  {
    label: 'AI Intelligence',
    items: [
      { label: 'AI Growth Recommendations', phase: 'P3' },
      { label: 'Alertas de datos faltantes', phase: 'P3' },
    ],
  },
  { label: 'Postventa y repuestos', items: [{ label: 'Turnos de taller', phase: 'P4' }, { label: 'Repuestos y accesorios', phase: 'P4' }] },
  {
    label: 'Configuración',
    items: [
      { label: 'Estado del sistema', href: '/system' },
      { label: 'Usuarios y roles', href: '/users' },
      { label: 'AI Governance', phase: 'P3' },
      { label: 'Canales conectados', phase: 'P2' },
    ],
  },
];

export const PAGE_TITLE: Record<string, string> = {
  '/': 'Command Center',
  '/leads': 'Leads & CRM',
  '/pipeline': 'Pipeline',
  '/campaigns': 'Campaign Intelligence',
  '/system': 'Estado del sistema',
  '/tasks': 'Seguimientos y tareas',
  '/quotes': 'Cotizadores',
  '/quotes/view': 'Propuesta',
  '/documents': 'Documentos y precios',
  '/users': 'Usuarios y roles',
  '/login': 'Ingresar',
};
