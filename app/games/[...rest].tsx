import { Redirect } from "expo-router";

// Universal link https://getnorma.app/games/{sport}/{date}/{matchup} (web SEO page).
// Web slugs do not map 1:1 to app game ids, so land on the games tab.
export default function GameWebLink() {
  return <Redirect href="/(tabs)/games" />;
}
