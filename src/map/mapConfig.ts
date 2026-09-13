export interface CityFeature {
  id: string;
  name: string;
  state: string;
  coordinates: [number, number]; // [lng, lat]
  type: 'capital' | 'major_hub' | 'strategic_point';
  accessibility: number; // percentage
  status: 'OPTIMAL' | 'MODERATE' | 'RESTRICTED' | 'CRITICAL';
  weather: {
    temp: number;
    condition: string;
    rainfall: string;
    windSpeed: string;
  };
  roadStatus: string;
  supplyCentersCount: number;
  hospitalsCount: number;
}

export const NORTHEAST_DEFAULT_VIEW = {
  center: [93.2, 26.1] as [number, number],
  zoom: 6.8,
  minZoom: 0.8, // Enables full zoom-out to complete 3D Earth Globe
  maxZoom: 19,
  pitch: 38,
  bearing: -6
};

export const GLOBE_SPACE_VIEW = {
  center: [85.0, 20.0] as [number, number],
  zoom: 1.6,
  pitch: 15,
  bearing: 0
};

export const NORTHEAST_CITIES: CityFeature[] = [
  {
    id: 'guwahati',
    name: 'Guwahati',
    state: 'Assam',
    coordinates: [91.7362, 26.1445],
    type: 'capital',
    accessibility: 96,
    status: 'OPTIMAL',
    weather: { temp: 26, condition: 'Heavy Rain', rainfall: '34 mm/h', windSpeed: '18 km/h' },
    roadStatus: 'NH-27 & GS Road fully operational. Minor waterlogging in Khanapara.',
    supplyCentersCount: 14,
    hospitalsCount: 8
  },
  {
    id: 'shillong',
    name: 'Shillong',
    state: 'Meghalaya',
    coordinates: [91.8933, 25.5788],
    type: 'capital',
    accessibility: 88,
    status: 'OPTIMAL',
    weather: { temp: 19, condition: 'Heavy Rainfall', rainfall: '45 mm/h', windSpeed: '22 km/h' },
    roadStatus: 'Umiam corridor clear with reduced speed advisory due to heavy fog.',
    supplyCentersCount: 6,
    hospitalsCount: 4
  },
  {
    id: 'itanagar',
    name: 'Itanagar',
    state: 'Arunachal Pradesh',
    coordinates: [93.6053, 27.0844],
    type: 'capital',
    accessibility: 82,
    status: 'MODERATE',
    weather: { temp: 22, condition: 'Scattered Showers', rainfall: '12 mm/h', windSpeed: '10 km/h' },
    roadStatus: 'NH-415 operational. Watch for debris near Gohpur border cut.',
    supplyCentersCount: 5,
    hospitalsCount: 3
  },
  {
    id: 'tawang',
    name: 'Tawang',
    state: 'Arunachal Pradesh',
    coordinates: [91.8594, 27.5861],
    type: 'strategic_point',
    accessibility: 58,
    status: 'RESTRICTED',
    weather: { temp: 11, condition: 'Dense Fog & Rain', rainfall: '28 mm/h', windSpeed: '32 km/h' },
    roadStatus: 'Sela Tunnel active. Landslide warning on NH-13 feeder sector.',
    supplyCentersCount: 3,
    hospitalsCount: 2
  },
  {
    id: 'dibrugarh',
    name: 'Dibrugarh',
    state: 'Assam',
    coordinates: [94.9120, 27.4728],
    type: 'major_hub',
    accessibility: 92,
    status: 'OPTIMAL',
    weather: { temp: 25, condition: 'Cloudy', rainfall: '8 mm/h', windSpeed: '14 km/h' },
    roadStatus: 'Bogibeel Bridge open. High freight throughput towards Pasighat.',
    supplyCentersCount: 7,
    hospitalsCount: 5
  },
  {
    id: 'kohima',
    name: 'Kohima',
    state: 'Nagaland',
    coordinates: [94.1086, 25.6751],
    type: 'capital',
    accessibility: 74,
    status: 'MODERATE',
    weather: { temp: 20, condition: 'Overcast', rainfall: '15 mm/h', windSpeed: '12 km/h' },
    roadStatus: 'Dimapur-Kohima 4-lane open; single lane restriction at Paglapahar zone.',
    supplyCentersCount: 4,
    hospitalsCount: 3
  },
  {
    id: 'imphal',
    name: 'Imphal',
    state: 'Manipur',
    coordinates: [93.9368, 24.8170],
    type: 'capital',
    accessibility: 65,
    status: 'RESTRICTED',
    weather: { temp: 23, condition: 'Thunderstorm Warning', rainfall: '22 mm/h', windSpeed: '20 km/h' },
    roadStatus: 'NH-2 section under tactical checkpoint diversion. Convoy escort recommended.',
    supplyCentersCount: 5,
    hospitalsCount: 4
  },
  {
    id: 'aizawl',
    name: 'Aizawl',
    state: 'Mizoram',
    coordinates: [92.7176, 23.7271],
    type: 'capital',
    accessibility: 84,
    status: 'OPTIMAL',
    weather: { temp: 21, condition: 'Mist', rainfall: '5 mm/h', windSpeed: '8 km/h' },
    roadStatus: 'NH-306 from Silchar clear. Fuel tankers transit priority active.',
    supplyCentersCount: 4,
    hospitalsCount: 3
  },
  {
    id: 'agartala',
    name: 'Agartala',
    state: 'Tripura',
    coordinates: [91.2868, 23.8315],
    type: 'capital',
    accessibility: 94,
    status: 'OPTIMAL',
    weather: { temp: 28, condition: 'Partly Cloudy', rainfall: '2 mm/h', windSpeed: '11 km/h' },
    roadStatus: 'NH-8 clear and connecting to ICP Akhaura border logistics dry port.',
    supplyCentersCount: 5,
    hospitalsCount: 3
  },
  {
    id: 'gangtok',
    name: 'Gangtok',
    state: 'Sikkim',
    coordinates: [88.6138, 27.3314],
    type: 'capital',
    accessibility: 76,
    status: 'MODERATE',
    weather: { temp: 15, condition: 'Chilly Drizzle', rainfall: '18 mm/h', windSpeed: '16 km/h' },
    roadStatus: 'NH-10 Teesta valley route under single-lane convoy control.',
    supplyCentersCount: 3,
    hospitalsCount: 2
  }
];
