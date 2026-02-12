import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Map as MapIcon, Navigation, MapPin, FileSpreadsheet } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import SearchBar from '../components/map/SearchBar';
import PlaceCard from '../components/map/PlaceCard';
import AddPlaceForm from '../components/map/AddPlaceForm';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icons with zoom-responsive sizing
const createIcon = (color, zoomLevel = 12) => {
  const isZoomedOut = zoomLevel < 13;
  const size = isZoomedOut ? 16 : 32;
  const height = isZoomedOut ? 21 : 42;
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative;">
        <svg width="${size}" height="${height}" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.2 0 0 7.2 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.2 24.8 0 16 0Z" fill="${color}"/>
          <circle cx="16" cy="16" r="6" fill="white"/>
        </svg>
      </div>
    `,
    iconSize: [size, height],
    iconAnchor: [size/2, height],
    popupAnchor: [0, -height]
  });
};

const categoryColors = {
  restaurant: '#f43f5e',
  activity: '#10b981',
  bar: '#a855f7',
  cafe: '#d97706',
  landmark: '#3b82f6'
};

// Component to handle map animations
function MapController({ center, zoom, highlightedPlace }) {
  const map = useMap();

  useEffect(() => {
    if (center && zoom) {
      map.flyTo(center, zoom, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [center, zoom, map]);

  useEffect(() => {
    if (highlightedPlace) {
      const marker = document.querySelector(`[data-place-id="${highlightedPlace.id}"]`);
      if (marker) {
        marker.style.animation = 'bounce 0.6s ease-in-out 3';
      }
    }
  }, [highlightedPlace]);

  return null;
}

// Component to track zoom level
function ZoomTracker({ setCurrentZoom }) {
  const map = useMap();

  useEffect(() => {
    const updateZoom = () => {
      setCurrentZoom(map.getZoom());
    };

    map.on('zoomend', updateZoom);
    updateZoom();

    return () => {
      map.off('zoomend', updateZoom);
    };
  }, [map, setCurrentZoom]);

  return null;
}

export default function MapPage() {
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);
  const [highlightedPlace, setHighlightedPlace] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(12);
  const mapRef = useRef(null);

  // L Train route: Myrtle-Wyckoff to 6th Ave (14th St)
  const lTrainRoute = [
    [40.6995, -73.9115], // Myrtle-Wyckoff
    [40.7065, -73.9195], // DeKalb Ave
    [40.7086, -73.9236], // Bedford Ave
    [40.7115, -73.9572], // 1st Ave
    [40.7148, -73.9803], // 3rd Ave
    [40.7308, -73.9896], // Union Square
    [40.7377, -73.9973]  // 6th Ave (14th St)
  ];

  // PATH Train route: 14th St to Hoboken Terminal
  const pathTrainRoute = [
    [40.7377, -73.9973], // 14th St (6th Ave)
    [40.7447, -74.0296]  // Hoboken Terminal
  ];

  const queryClient = useQueryClient();

  const { data: places = [], isLoading } = useQuery({
    queryKey: ['places'],
    queryFn: () => base44.entities.Place.list('-date_visited'),
  });

  const updatePlaceMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Place.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['places']);
    },
  });

  const handleToggleFavorite = async (place) => {
    await updatePlaceMutation.mutateAsync({
      id: place.id,
      data: { is_favorite: !place.is_favorite }
    });
  };

  const handlePlaceAdded = (newPlace) => {
    queryClient.invalidateQueries(['places']);
    setShowAddForm(false);
    setMapCenter([newPlace.latitude, newPlace.longitude]);
    setMapZoom(15);
    setTimeout(() => setSelectedPlace(newPlace), 800);
  };

  const handleSearchSelect = (place) => {
    setMapCenter([place.latitude, place.longitude]);
    setMapZoom(16);
    setHighlightedPlace(place);
    setTimeout(() => {
      setSelectedPlace(place);
      setHighlightedPlace(null);
    }, 1500);
  };

  const filteredPlaces = places.filter(place => {
    const categoryMatch = filterCategory === 'all' || place.category === filterCategory;
    const favoriteMatch = !showFavoritesOnly || place.is_favorite;
    return categoryMatch && favoriteMatch;
  });

  const defaultCenter = filteredPlaces.length > 0
    ? [filteredPlaces[0].latitude, filteredPlaces[0].longitude]
    : [40.7128, -74.0060];

  const handleRecenter = () => {
    if (filteredPlaces.length > 0) {
      const bounds = L.latLngBounds(
        filteredPlaces.map(p => [p.latitude, p.longitude])
      );
      mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  return (
    <div className="h-screen w-full relative overflow-hidden" style={{ backgroundColor: '#8FB5AB' }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] backdrop-blur-sm shadow-sm" style={{ background: '#8FB5AB' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold" style={{ color: '#536E66', fontSize: '18px' }}>A & C Map</h1>
              <p className="text-sm" style={{ color: '#536E66' }}>{filteredPlaces.length} places</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="border-2"
                style={{ backgroundColor: '#536E66', borderColor: '#536E66', color: '#C5D6D2' }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Place
              </Button>
              <Link to={createPageUrl('Spreadsheet')}>
                <Button
                  size="icon"
                  variant="outline"
                  className="border-2"
                  style={{ borderColor: '#536E66', color: '#536E66', backgroundColor: 'transparent' }}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Search Bar */}
          <SearchBar
            places={places}
            onSelectPlace={handleSearchSelect}
            className="max-w-2xl mx-auto"
          />

          {/* Category Filters */}
          <div className="flex items-center justify-center gap-2 mt-4" style={{ fontSize: '0.7rem' }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('all')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'all' ? '#536E66' : 'transparent',
                color: filterCategory === 'all' ? '#C5D6D2' : '#536E66'
              }}
            >
              All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('restaurant')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'restaurant' ? '#536E66' : 'transparent',
                color: filterCategory === 'restaurant' ? '#C5D6D2' : '#536E66'
              }}
            >
              Restaurants
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('cafe')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'cafe' ? '#536E66' : 'transparent',
                color: filterCategory === 'cafe' ? '#C5D6D2' : '#536E66'
              }}
            >
              Cafes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('activity')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'activity' ? '#536E66' : 'transparent',
                color: filterCategory === 'activity' ? '#C5D6D2' : '#536E66'
              }}
            >
              Activity
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('bar')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'bar' ? '#536E66' : 'transparent',
                color: filterCategory === 'bar' ? '#C5D6D2' : '#536E66'
              }}
            >
              Bar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterCategory('landmark')}
              className="border"
              style={{ 
                borderColor: '#536E66', 
                backgroundColor: filterCategory === 'landmark' ? '#536E66' : 'transparent',
                color: filterCategory === 'landmark' ? '#C5D6D2' : '#536E66'
              }}
            >
              Landmark
            </Button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="h-full w-full pt-[220px]">
        <MapContainer
          ref={mapRef}
          center={defaultCenter}
          zoom={12}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController center={mapCenter} zoom={mapZoom} highlightedPlace={highlightedPlace} />
          <ZoomTracker setCurrentZoom={setCurrentZoom} />
          
          {/* L Train Route */}
          <Polyline
            positions={lTrainRoute}
            pathOptions={{
              color: '#8B5CF6',
              weight: 4,
              opacity: 0.8
            }}
          />
          
          {/* PATH Train Route */}
          <Polyline
            positions={pathTrainRoute}
            pathOptions={{
              color: '#D93A30',
              weight: 4,
              opacity: 0.8
            }}
          />
          
          {filteredPlaces.map((place) => (
            <Marker
              key={place.id}
              position={[place.latitude, place.longitude]}
              icon={createIcon(categoryColors[place.category] || '#6b7280', currentZoom)}
              eventHandlers={{
                click: () => setSelectedPlace(place),
              }}
            >
              <div data-place-id={place.id} />
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Selected Place Card */}
      <AnimatePresence>
        {selectedPlace && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4">  
            <PlaceCard
              place={selectedPlace}
              onClose={() => setSelectedPlace(null)}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Add Place Form */}
      <AnimatePresence>
        {showAddForm && (
          <div className="absolute inset-0 z-[1001] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">  
            <AddPlaceForm
              onClose={() => setShowAddForm(false)}
              onPlaceAdded={handlePlaceAdded}
            />
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
        .custom-marker {
          background: none;
          border: none;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        }
        .leaflet-control-zoom a {
          background-color: #C5D6D2 !important;
          color: #536E66 !important;
          border: none !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #C5D6D2 !important;
          color: #536E66 !important;
        }
      `}</style>
    </div>
  );
}