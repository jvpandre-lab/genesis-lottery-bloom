import { createClient } from '@supabase/supabase-js';

const url = "https://kvlgqjvvzewbxivqceza.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGdxanZ2emV3YnhpdnFjZXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTc4MzMsImV4cCI6MjA5MjI3MzgzM30.Mwn0juUFWearR2SVm55pnEZP3oxSNob_PH7FfJnnRWU";

const supabase = createClient(url, key);

async function checkTable() {
    console.log("Checking lotomania_draws...");
    const { data, error } = await supabase.from('lotomania_draws').select('*').limit(1);
    if (error) {
        console.error("lotomania_draws Error:", error);
    } else {
        console.log("lotomania_draws exists. Data:", data);
    }

    console.log("\nChecking draws...");
    const { data: data2, error: error2 } = await supabase.from('draws').select('*').limit(1);
    if (error2) {
        console.error("draws Error:", error2);
    } else {
        console.log("draws exists. Data:", data2);
    }
}

checkTable();
