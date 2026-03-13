import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBblRggTOwbCjHHIJO86vVCMCFgq6ryhug",
  authDomain: "biomass-boiler-dashboard.firebaseapp.com",
  databaseURL: "https://biomass-boiler-dashboard-default-rtdb.firebaseio.com",
  projectId: "biomass-boiler-dashboard",
  storageBucket: "biomass-boiler-dashboard.firebasestorage.app",
  messagingSenderId: "540856685336",
  appId: "1:540856685336:web:41a2fa81976e28b1a0046d",
  measurementId: "G-K5GSDX1XYC",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
