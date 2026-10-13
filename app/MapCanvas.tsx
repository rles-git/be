'use client';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type MapStation = { id:number; name:string; plugs:number; status:'Available'|'Busy'|'Offline'; power:number; price:string; distance:string; address:string; type:'DC fast'|'AC charging'; lat:number; lng:number };
const qAuto = { lat:25.2526, lng:51.4867 };
function pinIcon(label:string, selected:boolean, main=false) {
  return L.divIcon({ className:'be-map-marker-wrap', html:`<div class="be-map-marker ${selected?'is-selected':''} ${main?'is-main':''}"><span>${main?'Q':label}</span>${main?'<small>Q-AUTO</small>':''}</div>`, iconSize: main?[62,54]:[42,42], iconAnchor: main?[31,27]:[21,21] });
}
function Recenter({ target, zoom=13 }: {target:[number,number];zoom?:number}) { const map=useMap(); useEffect(()=>{map.flyTo(target,zoom,{duration:.8})},[map,target[0],target[1],zoom]); return null; }
function SearchMap({ request, onResult }: {request:string;onResult:(message:string)=>void}) { const map=useMap(); const [last,setLast]=useState(''); useEffect(()=>{if(!request){setLast('');return;}if(request===last)return;setLast(request);let cancelled=false;(async()=>{try{const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(request+', Qatar')}`);if(!res.ok)throw new Error();const data=await res.json();if(cancelled)return;if(data?.[0]){map.flyTo([Number(data[0].lat),Number(data[0].lon)],15,{duration:.8});onResult('Location found');}else onResult('No matching place found in Qatar');}catch{if(!cancelled)onResult('Search unavailable. Try a landmark or address.')}})();return()=>{cancelled=true}},[request,last,map,onResult]);return null; }
function MapTools({ centerKey }: {centerKey:number}) { const map=useMap(); useEffect(()=>{map.flyTo([qAuto.lat,qAuto.lng],13,{duration:.8})},[centerKey,map]); return <div className="leaflet-custom-zoom"><button onClick={()=>map.zoomIn()} aria-label="Zoom in">+</button><button onClick={()=>map.zoomOut()} aria-label="Zoom out">−</button></div>; }
export default function MapCanvas({ stations, selectedId, onSelect, searchRequest, onSearchResult, showSatellite=false, centerKey=0 }: {stations:MapStation[];selectedId:number|null;onSelect:(s:MapStation)=>void;searchRequest:string;onSearchResult:(message:string)=>void;showSatellite?:boolean;centerKey?:number}) {
 const [center,setCenter]=useState<[number,number]>([qAuto.lat,qAuto.lng]);
 const icons=useMemo(()=>new Map(stations.map(s=>[s.id,pinIcon(String(s.plugs),selectedId===s.id)])),[stations,selectedId]);
 const mainIcon=useMemo(()=>pinIcon('Q',selectedId===1,true),[selectedId]);
 return <MapContainer center={center} zoom={13} zoomControl={false} scrollWheelZoom className="real-leaflet-map">
   <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url={showSatellite?'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png':'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />
   <SearchMap request={searchRequest} onResult={onSearchResult}/><MapTools centerKey={centerKey}/>
   <Recenter target={center}/>
   <Marker position={[qAuto.lat,qAuto.lng]} icon={mainIcon} eventHandlers={{click:()=>onSelect(stations.find(s=>s.id===1)!)}}><Popup><b>Q-Auto Qatar</b><br/>Al Waab Commercial Complex, Salwa Road<br/><a href="https://www.google.com/maps/search/?api=1&query=Q-Auto+Qatar+Al+Waab" target="_blank" rel="noreferrer">Open in Google Maps</a></Popup></Marker>
   {stations.filter(s=>s.id!==1).map(s=><Marker key={s.id} position={[s.lat,s.lng]} icon={icons.get(s.id)!} eventHandlers={{click:()=>onSelect(s)}}><Popup><b>{s.name}</b><br/>{s.power} kW · {s.status}<br/>{s.address}</Popup></Marker>)}
   <Circle center={[qAuto.lat,qAuto.lng]} radius={900} pathOptions={{color:'#77977e',fillColor:'#9db7a2',fillOpacity:.08,weight:1,dashArray:'5 7'}} />
 </MapContainer>;
}
