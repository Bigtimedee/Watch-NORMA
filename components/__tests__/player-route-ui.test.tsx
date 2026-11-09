import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { PlayerRouteSettingsForm } from "../PlayerRouteSettingsForm";
import { PlayerRouteSecondaryAction } from "../PlayerRouteSecondaryAction";
import { WatchNowButton } from "../WatchNowButton";
import type { Game } from "../../lib/types";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

let mockConnected: string[] = [];
let mockProviders: unknown[] = [];
jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => mockConnected,
  useStreamingProviders: () => ({ data: mockProviders }),
}));
jest.mock("../../lib/tap-to-stream-context", () => ({
  useTapToStream: () => ({ triggerStream: jest.fn(), phase: { value: 0 } }),
}));
jest.mock("../../hooks/useTapToStream", () => ({ PHASE_ANTICIPATION: 1, PHASE_COMMITMENT: 2 }));
jest.mock("../../hooks/useInstalledApps", () => ({
  useInstalledApps: () => ({}),
}));

const YTTV = {
  key: "youtube_tv",
  name: "YouTube TV",
  provider_type: "tv",
  logo_url: null,
  ios_scheme: "youtube-tv://",
  ios_app_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
  android_package: null,
  android_deep_link: null,
  web_url: "https://tv.youtube.com",
  active: true,
  universal_link: null,
  fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
  auth_mode: "deep_link_only",
  category: "tv",
};

function game(): Game {
  return {
    id: "g1",
    sport: "nba",
    home_team_id: "t1",
    away_team_id: "t2",
    status: "inprogress",
    home_score: 1,
    away_score: 1,
    clock: "1:00",
    period: 2,
    scheduled_at: "2026-11-09T18:00:00.000Z",
    broadcast: "ESPN",
    venue: null,
    title: null,
    source: "espn",
    payload_hash: null,
    created_at: "2026-11-09T18:00:00.000Z",
    updated_at: "2026-11-09T18:00:00.000Z",
    home_team: null,
    away_team: null,
  } as unknown as Game;
}

describe("player route UI", () => {
  it("keeps Watch on YouTube TV and hides the player action while the feature is off", () => {
    mockConnected = ["youtube_tv"];
    mockProviders = [YTTV];
    const view = render(
      <>
        <WatchNowButton game={game()} />
        <PlayerRouteSecondaryAction broadcast="ESPN" />
      </>
    );
    expect(view.getByLabelText("Watch on YouTube TV")).toBeTruthy();
    expect(view.queryByTestId("player-route-secondary")).toBeNull();
  });

  it("hides the address field when configuration is not allowed and masks it when it is", async () => {
    const hidden = render(
      <PlayerRouteSettingsForm
        model={{
          configurationAllowed: false,
          encodingBlocked: true,
          optIn: false,
          reinstallLocked: true,
          feeds: [],
          routes: [],
          hasDeletableData: true,
        }}
        onOptIn={async () => null}
        onDisableOptIn={async () => undefined}
        onSave={async () => null}
        onTest={async () => ({ accepted: false, message: "blocked" })}
        onConfirm={async () => null}
        onToggleEnabled={async () => undefined}
        onDelete={async () => undefined}
        onDeleteAll={async () => undefined}
        onAcknowledgeReinstall={async () => undefined}
      />
    );
    expect(hidden.queryByTestId("player-route-url-input")).toBeNull();
    expect(hidden.getByLabelText("Delete all player routes")).toBeTruthy();
    expect(hidden.getByText(/experimental player option is not available/)).toBeTruthy();

    const onTest = jest.fn(async () => ({ accepted: false, message: "NORMA will not open a stream in StrymTV on this build." }));
    const shown = render(
      <PlayerRouteSettingsForm
        model={{
          configurationAllowed: true,
          encodingBlocked: true,
          optIn: true,
          reinstallLocked: false,
          feeds: [{ id: "us.national.espn", label: "ESPN (US national)" }],
          routes: [{ id: "r1", feedLabel: "ESPN (US national)", label: "Home", enabled: true, confirmed: false }],
          hasDeletableData: true,
        }}
        onOptIn={async () => null}
        onDisableOptIn={async () => undefined}
        onSave={async () => "NORMA can't use that address."}
        onTest={onTest}
        onConfirm={async () => "blocked"}
        onToggleEnabled={async () => undefined}
        onDelete={async () => undefined}
        onDeleteAll={async () => undefined}
        onAcknowledgeReinstall={async () => undefined}
      />
    );
    const input = shown.getByTestId("player-route-url-input");
    expect(input.props.secureTextEntry).toBe(true);
    await act(async () => {
      fireEvent.press(shown.getByLabelText("Test in StrymTV"));
    });
    expect(onTest).toHaveBeenCalledWith("r1");
    expect(shown.getByText(/does not provide, find, or host streams/)).toBeTruthy();
  });
});
