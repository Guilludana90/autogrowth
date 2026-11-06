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
      { label: 'Inbox de conversaciones', href: '/inbox' },
    ],
  },
  {
    label: 'Campañas',
    items: [
      { label: 'Campaign Intelligence', href: '/campaigns' },
      { label: 'Métricas por canal', href: '/channels' },
    ],
  },
  {
    label: 'AI Intelligence',
    items: [
      { label: 'AI Growth Recommendations', href: '/recommendations' },
      { label: 'Resúmenes de conversaciones', phase: 'Pend.' },
      { label: 'Oportunidades detectadas', href: '/opportunities' },
      { label: 'Alertas de datos faltantes', href: '/data-alerts' },
    ],
  },
  {
    label: 'Postventa y repuestos',
    items: [
      { label: 'Turnos de taller', href: '/service' },
      { label: 'Repuestos y accesorios', href: '/parts' },
      { label: 'Base de conocimiento', href: '/knowledge' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { label: 'Estado del sistema', href: '/system' },
      { label: 'Usuarios y roles', href: '/users' },
      { label: 'AI Governance', href: '/governance' },
      { label: 'Canales conectados', href: '/integrations' },
    ],
  },
];

export const PAGE_TITLE: Record<string, string> = {
  '/': 'Command Center',
  '/leads': 'Leads & CRM',
  '/pipeline': 'Pipeline',
  '/campaigns': 'Campaign Intelligence',
  '/campaigns/view': 'Detalle de campaña',
  '/channels': 'Métricas por canal',
  '/integrations': 'Canales conectados',
  '/system': 'Estado del sistema',
  '/tasks': 'Seguimientos y tareas',
  '/quotes': 'Cotizadores',
  '/quotes/view': 'Propuesta',
  '/documents': 'Documentos y precios',
  '/users': 'Usuarios y roles',
  '/recommendations': 'AI Growth Recommendations',
  '/opportunities': 'Oportunidades detectadas',
  '/data-alerts': 'Alertas de datos faltantes',
  '/governance': 'AI Governance',
  '/service': 'Turnos de taller',
  '/parts': 'Repuestos y accesorios',
  '/knowledge': 'Base de conocimiento',
  '/inbox': 'Inbox de conversaciones',
  '/login': 'Ingresar',
};
