import type { RoadCorridor, IncidentAlert, Vehicle, AuthUser } from './apiTypes';

export const DEFAULT_USERS: Record<string, AuthUser> = {
  admin: {
    id: 'usr-admin-01',
    name: 'Brigadier Arvind Sharma',
    email: 'admin.niel@nec.gov.in',
    role: 'admin',
    department: 'Northeast Logistics Command & Control Hub',
    token: 'jwt-niel-session-token-admin-88231'
  },
  field_officer: {
    id: 'usr-field-02',
    name: 'Major L. Sailo',
    email: 'field.sailo@arunachal.disaster.gov.in',
    role: 'field_officer',
    department: 'Assam-Arunachal Disaster Taskforce',
    token: 'jwt-niel-session-token-field-44102'
  },
  transporter: {
    id: 'usr-trans-03',
    name: 'Tsering Dorjee',
    email: 'dorjee.logistics@himalayanfleet.in',
    role: 'transporter',
    department: 'Trans-Himalayan Essential Freight Fleet',
    token: 'jwt-niel-session-token-transporter-99214'
  }
};

export const INITIAL_ROAD_CORRIDORS: RoadCorridor[] = [
  {
    id: 'corridor-ghy-shl',
    name: 'Guwahati - Shillong Expressway',
    highwayNumber: 'NH-106',
    from: 'Guwahati',
    to: 'Shillong',
    distanceKm: 98,
    status: 'OPEN',
    averageSpeedKmph: 65,
    riskFactor: 1.0,
    lastUpdated: 'Just now',
    coordinates: [
      [91.7362, 26.1445], // Guwahati
      [91.7820, 26.0850], // Khanapara
      [91.8200, 25.9600], // Byrnihat
      [91.8700, 25.8000], // Nongpoh
      [91.8980, 25.6600], // Umiam
      [91.8933, 25.5788]  // Shillong
    ]
  },
  {
    id: 'corridor-ghy-dib',
    name: 'Brahmaputra South & North Trunk',
    highwayNumber: 'NH-27 / NH-15',
    from: 'Guwahati',
    to: 'Dibrugarh',
    distanceKm: 440,
    status: 'OPEN',
    averageSpeedKmph: 72,
    riskFactor: 1.0,
    lastUpdated: '5 min ago',
    coordinates: [
      [91.7362, 26.1445], // Guwahati
      [92.1500, 26.2400], // Jagiroad
      [92.6800, 26.3400], // Nagaon
      [92.8500, 26.6200], // Kaliabor / Tezpur junction
      [93.5800, 26.6500], // Bokakhat (Kaziranga corridor)
      [93.9700, 26.7500], // Numaligarh
      [94.2100, 26.7600], // Jorhat
      [94.6300, 26.9800], // Sivasagar
      [94.9120, 27.4728]  // Dibrugarh
    ]
  },
  {
    id: 'corridor-tez-ita',
    name: 'Tezpur - Itanagar Capital Arterial',
    highwayNumber: 'NH-415',
    from: 'Tezpur',
    to: 'Itanagar',
    distanceKm: 155,
    status: 'OPEN',
    averageSpeedKmph: 55,
    riskFactor: 1.1,
    lastUpdated: '12 min ago',
    coordinates: [
      [92.8500, 26.6200], // Tezpur cut
      [93.1500, 26.8500], // Balipara
      [93.4200, 26.9900], // Banderdewa
      [93.6053, 27.0844]  // Itanagar
    ]
  },
  {
    id: 'corridor-tez-tawang',
    name: 'Trans-Arunachal Tawang Strategic Sector',
    highwayNumber: 'NH-13',
    from: 'Tezpur',
    to: 'Tawang',
    distanceKm: 320,
    status: 'BLOCKED',
    averageSpeedKmph: 0,
    riskFactor: Infinity,
    lastUpdated: '15 min ago',
    coordinates: [
      [93.1500, 26.8500], // Balipara
      [92.6500, 27.0100], // Bhalukpong (Landslide zone)
      [92.4200, 27.2600], // Bomdila
      [92.1000, 27.5000], // Sela Tunnel / Dirang
      [91.9500, 27.5300], // Jang
      [91.8594, 27.5861]  // Tawang
    ]
  },
  {
    id: 'corridor-orang-tawang-alt',
    name: 'Orang - Kalaktang - Shergaon Alternate Bypass',
    highwayNumber: 'State Route 11',
    from: 'Guwahati',
    to: 'Tawang',
    distanceKm: 364,
    status: 'OPEN',
    averageSpeedKmph: 45,
    riskFactor: 1.2,
    lastUpdated: 'Just now',
    coordinates: [
      [91.7362, 26.1445], // Guwahati
      [91.9500, 26.3500], // Mangaldai
      [92.1500, 26.6500], // Orang
      [92.1100, 26.9800], // Kalaktang
      [92.2500, 27.2000], // Rupa
      [92.4200, 27.2600], // Bomdila
      [92.1000, 27.5000], // Sela Tunnel
      [91.8594, 27.5861]  // Tawang
    ]
  },
  {
    id: 'corridor-shl-sil',
    name: 'Meghalaya - Barak Valley Corridor',
    highwayNumber: 'NH-6',
    from: 'Shillong',
    to: 'Silchar',
    distanceKm: 215,
    status: 'RISKY',
    averageSpeedKmph: 38,
    riskFactor: 2.2,
    lastUpdated: '20 min ago',
    coordinates: [
      [91.8933, 25.5788], // Shillong
      [92.2000, 25.4500], // Jowai
      [92.4000, 25.1800], // Lad Rymbai
      [92.5200, 24.9800], // Sonapur Tunnel (Mudflow caution)
      [92.7926, 24.8333]  // Silchar
    ]
  },
  {
    id: 'corridor-dmp-kma-imp',
    name: 'Nagaland - Manipur Lifeline Highway',
    highwayNumber: 'NH-2',
    from: 'Dimapur',
    to: 'Imphal',
    distanceKm: 202,
    status: 'BLOCKED',
    averageSpeedKmph: 0,
    riskFactor: Infinity,
    lastUpdated: '30 min ago',
    coordinates: [
      [93.7270, 25.9064], // Dimapur
      [94.0200, 25.7500], // Chumukedima
      [94.1086, 25.6751], // Kohima
      [94.1200, 25.5000], // Mao Gate
      [93.9800, 25.2500], // Senapati (Checkpoint blockage)
      [93.9500, 25.0200], // Kangpokpi
      [93.9368, 24.8170]  // Imphal
    ]
  },
  {
    id: 'corridor-sil-aiz',
    name: 'Mizoram Supply Lifeline',
    highwayNumber: 'NH-306',
    from: 'Silchar',
    to: 'Aizawl',
    distanceKm: 172,
    status: 'OPEN',
    averageSpeedKmph: 52,
    riskFactor: 1.0,
    lastUpdated: '8 min ago',
    coordinates: [
      [92.7926, 24.8333], // Silchar
      [92.7000, 24.5000], // Vairengte (Mizoram Gate)
      [92.6800, 24.1500], // Kolasib
      [92.7176, 23.7271]  // Aizawl
    ]
  },
  {
    id: 'corridor-sil-aga',
    name: 'Tripura Interstate Corridor',
    highwayNumber: 'NH-8',
    from: 'Silchar',
    to: 'Agartala',
    distanceKm: 288,
    status: 'OPEN',
    averageSpeedKmph: 60,
    riskFactor: 1.0,
    lastUpdated: '10 min ago',
    coordinates: [
      [92.7926, 24.8333], // Silchar
      [92.3500, 24.6000], // Karimganj
      [92.1500, 24.2800], // Dharmanagar
      [91.8500, 24.0500], // Ambassa
      [91.5000, 23.9000], // Teliamura
      [91.2868, 23.8315]  // Agartala
    ]
  },
  {
    id: 'corridor-jor-nlak-ita',
    name: 'Jorhat - North Lakhimpur - Itanagar Express Arterial',
    highwayNumber: 'NH-150',
    from: 'Jorhat',
    to: 'Itanagar',
    distanceKm: 129,
    status: 'OPEN',
    averageSpeedKmph: 62,
    riskFactor: 1.1,
    lastUpdated: 'Just now',
    district: 'Jorhat',
    coordinates: [
      [94.2100, 26.7600], // Jorhat (shares node with NH-27 trunk)
      [94.3400, 26.9200], // Dergaon
      [94.5100, 27.0200], // North Lakhimpur
      [94.4400, 27.2400], // Bihpuria
      [93.7952, 27.2352]  // Itanagar cut
    ]
  },
  {
    id: 'corridor-ita-bhl',
    name: 'Itanagar - Bhalukpong - Balipara Strategic Link',
    highwayNumber: 'NH-415 / NH-13',
    from: 'Itanagar',
    to: 'Balipara',
    distanceKm: 103,
    status: 'OPEN',
    averageSpeedKmph: 55,
    riskFactor: 1.2,
    lastUpdated: 'Just now',
    district: 'Papum Pare',
    coordinates: [
      [93.6053, 27.0844], // Itanagar
      [93.5600, 27.0600], // Nirjuli
      [93.4200, 26.9900], // Banderdewa
      [93.1500, 26.8500], // Balipara
      [92.9500, 26.9500], // Doimukh cut
      [92.6500, 27.0100]  // Bhalukpong (landslide watch zone)
    ]
  },
  {
    id: 'corridor-dmp-pfz',
    name: 'Dimapur - Pfutsero - Kohima Highland Bypass',
    highwayNumber: 'SH-02',
    from: 'Dimapur',
    to: 'Kohima',
    distanceKm: 65,
    status: 'RISKY',
    averageSpeedKmph: 35,
    riskFactor: 2.2,
    lastUpdated: 'Just now',
    district: 'Kohima',
    coordinates: [
      [93.7270, 25.9064], // Dimapur
      [93.9700, 25.6500], // Pfutsero
      [94.0500, 25.5500], // Mao Gate junction
      [94.1086, 25.6751]  // Kohima
    ]
  },
  {
    id: 'corridor-jor-dmp',
    name: 'Jorhat - Dimapur Freight Link',
    highwayNumber: 'NH-129',
    from: 'Jorhat',
    to: 'Dimapur',
    distanceKm: 151,
    status: 'OPEN',
    averageSpeedKmph: 58,
    riskFactor: 1.0,
    lastUpdated: 'Just now',
    district: 'Golaghat',
    coordinates: [
      [94.2100, 26.7600], // Jorhat
      [94.5800, 26.5000], // Wokha cut
      [94.1500, 26.2500], // Tseminyu
      [93.9700, 26.1000], // Niuland
      [93.7270, 25.9064]  // Dimapur
    ]
  },
  {
    id: 'corridor-shl-dwk',
    name: 'Shillong - Dawki Border Link',
    highwayNumber: 'NH-40',
    from: 'Shillong',
    to: 'Dawki',
    distanceKm: 65,
    status: 'OPEN',
    averageSpeedKmph: 50,
    riskFactor: 1.3,
    lastUpdated: 'Just now',
    district: 'East Khasi Hills',
    coordinates: [
      [91.8933, 25.5788], // Shillong
      [91.8600, 25.4100], // Pynursla
      [91.8400, 25.2500], // Nohkalikai falls sector
      [92.0600, 25.1900], // Tyrna
      [92.1000, 25.1500]  // Dawki (Indo-Bangladesh ICP)
    ]
  },
  {
    id: 'corridor-aga-sil',
    name: 'Agartala - Silchar Secondary Trunk',
    highwayNumber: 'NH-8 / NH-6',
    from: 'Agartala',
    to: 'Silchar',
    distanceKm: 189,
    status: 'RISKY',
    averageSpeedKmph: 38,
    riskFactor: 2.4,
    lastUpdated: 'Just now',
    district: 'West Tripura',
    coordinates: [
      [91.2868, 23.8315], // Agartala
      [91.7000, 23.9000], // Udaipur
      [91.8500, 24.0500], // Ambassa
      [92.2000, 24.4000], // Santir Bazar
      [92.6500, 24.6500], // Karimganj
      [92.7926, 24.8333]  // Silchar
    ]
  },
  {
    id: 'corridor-aiz-chp',
    name: 'Aizawl - Champhai MZ-3 Border Corridor',
    highwayNumber: 'MZ-3',
    from: 'Aizawl',
    to: 'Champhai',
    distanceKm: 90,
    status: 'BLOCKED',
    averageSpeedKmph: 0,
    riskFactor: Infinity,
    lastUpdated: 'Just now',
    district: 'Aizawl',
    coordinates: [
      [92.7176, 23.7271], // Aizawl
      [93.0400, 23.7200], // Seling
      [93.2100, 23.9000], // Ngopa
      [93.4500, 23.9000], // Champhai cut
      [93.3500, 23.9500]  // Zokhawthar (Indo-Myanmar lane)
    ]
  },
  {
    id: 'corridor-zir-yaz',
    name: 'Ziro - Yazali Valley Feeder',
    highwayNumber: 'SH-12',
    from: 'Itanagar',
    to: 'Ziro',
    distanceKm: 58,
    status: 'RISKY',
    averageSpeedKmph: 32,
    riskFactor: 2.6,
    lastUpdated: 'Just now',
    district: 'Lower Subansiri',
    coordinates: [
      [93.6053, 27.0844], // Itanagar
      [93.7000, 27.2500], // Yazali
      [93.8300, 27.4800], // Kheel
      [93.9000, 27.5400]  // Ziro (Tale Valley)
    ]
  },
  {
    id: 'corridor-sil-aiz-bee',
    name: 'Silchar - Aizawl Bee-Line Connector',
    highwayNumber: 'NH-306',
    from: 'Silchar',
    to: 'Aizawl',
    distanceKm: 141,
    status: 'OPEN',
    averageSpeedKmph: 55,
    riskFactor: 1.2,
    lastUpdated: 'Just now',
    district: 'Cachar',
    coordinates: [
      [92.7926, 24.8333], // Silchar
      [92.5500, 24.6300], // Aibal
      [92.4200, 24.4000], // Hmarkawl
      [92.5000, 24.1800], // Sihphir cut
      [92.7176, 23.7271]  // Aizawl
    ]
  }
];

export const INITIAL_INCIDENTS_DATA: IncidentAlert[] = [
  {
    id: 'inc-01',
    type: 'LANDSLIDE',
    title: 'Landslide blockage on mountain pass',
    locationName: 'NH-13, Bhalukpong-Bomdila Sector',
    state: 'Arunachal Pradesh',
    coordinates: [92.5200, 27.1800],
    severity: 'CRITICAL',
    reportedAgo: '12 min ago',
    reportedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    description: 'Severe rockslide blockage following 48hr continuous precipitation. Earthmoving clearance underway.',
    impactedCorridor: 'NH-13 Tawang Supply Line',
    alternateRouteAvailable: true,
    reportedBy: 'Major L. Sailo (Field Taskforce)',
    status: 'ACTIVE'
  },
  {
    id: 'inc-02',
    type: 'RAIN',
    title: 'Flash rainfall & Hydroplaning hazard',
    locationName: 'East Khasi Hills, Cherrapunji Sector',
    state: 'Meghalaya',
    coordinates: [91.7300, 25.2800],
    severity: 'WARNING',
    reportedAgo: '28 min ago',
    reportedAt: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    description: 'Flash precipitation exceeding 60mm/h. Visibility reduced below 20 meters across southern slopes.',
    impactedCorridor: 'Shillong - Dawki Border Route',
    alternateRouteAvailable: true,
    reportedBy: 'Regional Weather Center Shillong',
    status: 'ACTIVE'
  },
  {
    id: 'inc-03',
    type: 'ROAD_BLOCK',
    title: 'Security checkpost queue and closure',
    locationName: 'NH-2, Senapati - Kangpokpi Sector',
    state: 'Manipur',
    coordinates: [93.9600, 25.1200],
    severity: 'CRITICAL',
    reportedAgo: '45 min ago',
    reportedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    description: 'Freight movement restricted. Armed convoy escort mandatory for medical & emergency food consignments.',
    impactedCorridor: 'NH-2 Imphal Lifeline',
    alternateRouteAvailable: false,
    reportedBy: 'Manipur Logistics Command',
    status: 'ACTIVE'
  },
  {
    id: 'inc-04',
    type: 'BORDER_ADVISORY',
    title: 'Border movement night transit restrictions',
    locationName: 'Moreh / Indo-Myanmar Border Corridor',
    state: 'Manipur',
    coordinates: [94.3000, 24.2400],
    severity: 'ADVISORY',
    reportedAgo: '1 hour ago',
    reportedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    description: 'Restricted night transit protocols implemented along border crossing nodes. Heightened vigil.',
    impactedCorridor: 'Asian Highway 1 Feeder',
    alternateRouteAvailable: true,
    reportedBy: 'Customs ICP Moreh',
    status: 'ACTIVE'
  },
  {
    id: 'inc-05',
    type: 'FLOOD',
    title: 'Brahmaputra tributary waterlogging',
    locationName: 'Kaziranga Southern Bypass, Golaghat',
    state: 'Assam',
    coordinates: [93.7500, 26.6000],
    severity: 'WARNING',
    reportedAgo: '2 hours ago',
    reportedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    description: 'Tributaries approaching high flood level. Animal corridor speed restrictions 40 km/h strictly enforced.',
    impactedCorridor: 'NH-715 Trunk Road',
    alternateRouteAvailable: true,
    reportedBy: 'Assam Water Resources Div',
    status: 'ACTIVE'
  }
];

export const INITIAL_VEHICLES_DATA: Vehicle[] = [
  {
    id: 'veh-as-01',
    vehicleNumber: 'AS-01-EC-9482',
    driverName: 'Ranjit Borah',
    driverPhone: '+91 94350-12847',
    cargoType: 'Medicine',
    cargoWeightKg: 4200,
    origin: 'Guwahati Central Depot',
    destination: 'Tawang District Hospital',
    coordinates: [92.1100, 26.9800], // Near Kalaktang
    headingDeg: 340,
    speedKmph: 48,
    fuelPercentage: 78,
    deliveryStatus: 'EN_ROUTE',
    lastPingTimestamp: 'Just now',
    etaHours: 5.2,
    corridorId: 'corridor-orang-tawang-alt'
  },
  {
    id: 'veh-mn-02',
    vehicleNumber: 'MN-01-TX-3321',
    driverName: 'Biren Meitei',
    driverPhone: '+91 98620-88319',
    cargoType: 'Food',
    cargoWeightKg: 9500,
    origin: 'Dimapur Rail Rake',
    destination: 'Imphal Mantripukhri Depot',
    coordinates: [94.0500, 25.7100], // Near Kohima outskirts
    headingDeg: 195,
    speedKmph: 0,
    fuelPercentage: 62,
    deliveryStatus: 'DELAYED',
    lastPingTimestamp: '4 min ago',
    etaHours: 9.8,
    corridorId: 'corridor-dmp-kma-imp'
  },
  {
    id: 'veh-mz-03',
    vehicleNumber: 'MZ-01-F-7104',
    driverName: 'Lalremruata',
    driverPhone: '+91 97740-52011',
    cargoType: 'Fuel',
    cargoWeightKg: 12000,
    origin: 'Silchar Southern Base',
    destination: 'Aizawl IOCL Terminal',
    coordinates: [92.7000, 24.5000], // Near Vairengte
    headingDeg: 175,
    speedKmph: 54,
    fuelPercentage: 91,
    deliveryStatus: 'EN_ROUTE',
    lastPingTimestamp: '1 min ago',
    etaHours: 2.8,
    corridorId: 'corridor-sil-aiz'
  },
  {
    id: 'veh-ar-04',
    vehicleNumber: 'AR-01-R-5590',
    driverName: 'Khandu Wangchuk',
    driverPhone: '+91 94020-66412',
    cargoType: 'Relief Supplies',
    cargoWeightKg: 6800,
    origin: 'Tezpur Supply Node',
    destination: 'Itanagar Emergency Staging',
    coordinates: [93.4200, 26.9900], // Banderdewa
    headingDeg: 45,
    speedKmph: 58,
    fuelPercentage: 84,
    deliveryStatus: 'EN_ROUTE',
    lastPingTimestamp: '2 min ago',
    etaHours: 1.1,
    corridorId: 'corridor-tez-ita'
  },
  {
    id: 'veh-tr-05',
    vehicleNumber: 'TR-01-EQ-1928',
    driverName: 'Subhas Debbarma',
    driverPhone: '+91 94361-90123',
    cargoType: 'Equipment',
    cargoWeightKg: 8200,
    origin: 'Silchar Southern Base',
    destination: 'Agartala ICP Dry Port',
    coordinates: [91.8500, 24.0500], // Ambassa
    headingDeg: 230,
    speedKmph: 62,
    fuelPercentage: 70,
    deliveryStatus: 'EN_ROUTE',
    lastPingTimestamp: 'Just now',
    etaHours: 1.8,
    corridorId: 'corridor-sil-aga'
  }
];
