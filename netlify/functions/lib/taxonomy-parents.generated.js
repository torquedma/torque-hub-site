// GENERATED FROM js/taxonomy-data.js — DO NOT EDIT. Run: node scripts/generate-taxonomy-parents.js
'use strict';

const SUBCATEGORY_PARENT = Object.freeze({
  "Belt Trailer": "Trailers",
  "Boom Mower": "Farm",
  "Boom Truck": "Trucks",
  "Box Truck": "Trucks",
  "Bucket Truck": "Trucks",
  "Cab & Chassis": "Trucks",
  "Car Carrier Truck": "Trucks",
  "Car Hauler Trailer": "Trailers",
  "Cargo Van": "Trucks",
  "Compact Track Loader": "Construction",
  "Concession Trailer": "Trailers",
  "Conestoga Trailer": "Trailers",
  "Crane Truck": "Construction",
  "Crawler Excavator": "Construction",
  "Crawler Loader": "Construction",
  "Day Cab Tractor": "Trucks",
  "Deckover Trailer": "Trailers",
  "Drum Mower": "Farm",
  "Dry Van Trailer": "Trailers",
  "Dump Trailer": "Trailers",
  "Dump Truck": "Trucks",
  "Enclosed Trailer": "Trailers",
  "Equipment Trailer": "Trailers",
  "Excavator": "Construction",
  "Flatbed Trailer": "Trailers",
  "Flatbed Truck": "Trucks",
  "Forklift": "Construction",
  "Gooseneck Trailer": "Trailers",
  "Grain Dump Truck": "Trucks",
  "Hay Rake": "Farm",
  "Hopper Bottom Trailer": "Trailers",
  "Landscape Truck": "Trucks",
  "Lawn Tractor": "Landscape",
  "Living Quarters Trailer": "Trailers",
  "Mini Excavator": "Construction",
  "Mini Skid Steer": "Construction",
  "Pickup Truck": "Trucks",
  "Race Trailer": "Trailers",
  "Reefer Trailer": "Trailers",
  "Refrigerated Truck": "Trucks",
  "Roll-Off": "Trucks",
  "Rollback Tow Truck": "Trucks",
  "Rotary Cutter": "Farm",
  "Scissor Lift": "Construction",
  "Service Truck": "Trucks",
  "Skid Steer": "Construction",
  "Skid Steer Attachment": "Construction",
  "Sleeper Tractor": "Trucks",
  "Tractor": "Farm",
  "Utility Trailer": "Trailers",
  "Utility Vehicle": "Farm",
  "Vacuum Truck": "Trucks",
  "Wheel Loader": "Construction",
  "Yard Spotter": "Trucks",
  "Zero Turn Mower": "Landscape",
});

// Canonical parent category of a subcategory, or null when the taxonomy does not declare one.
function parentOf(subcategory) {
  return typeof subcategory === 'string' && Object.prototype.hasOwnProperty.call(SUBCATEGORY_PARENT, subcategory)
    ? SUBCATEGORY_PARENT[subcategory] : null;
}

module.exports = { SUBCATEGORY_PARENT, parentOf };
