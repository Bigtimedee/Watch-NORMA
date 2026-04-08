import { ScrollView, Pressable, Text, View, StyleSheet } from "react-native";
import { useRef, useEffect } from "react";

interface DatePickerProps {
  selectedOffset: number;
  onSelectOffset: (offset: number) => void;
}

/**
 * Returns { y, m, d } for today in Eastern Time.
 * Primary path: Intl.DateTimeFormat with timeZone option.
 * Fallback: subtract the Eastern UTC offset from UTC time so the
 * result is always valid even on Hermes builds where Intl.DateTimeFormat
 * with a named timeZone may throw or return malformed parts.
 */
function getEasternToday(): { y: number; m: number; d: number } {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const yearPart = parts.find((p) => p.type === "year");
    const monthPart = parts.find((p) => p.type === "month");
    const dayPart = parts.find((p) => p.type === "day");

    if (!yearPart || !monthPart || !dayPart) throw new Error("missing parts");

    const y = parseInt(yearPart.value, 10);
    const m = parseInt(monthPart.value, 10);
    const d = parseInt(dayPart.value, 10);

    if (isNaN(y) || isNaN(m) || isNaN(d)) throw new Error("NaN parts");

    return { y, m, d };
  } catch {
    // Fallback: Eastern is UTC-5 (EST) or UTC-4 (EDT).
    // We approximate by subtracting 4 hours from UTC, which keeps us on the
    // correct calendar date for the overwhelming majority of the day in both
    // EST and EDT. This is only reached when Intl is unavailable.
    const now = new Date();
    const easternMs = now.getTime() - 4 * 60 * 60 * 1000;
    const easternDate = new Date(easternMs);
    return {
      y: easternDate.getUTCFullYear(),
      m: easternDate.getUTCMonth() + 1,
      d: easternDate.getUTCDate(),
    };
  }
}

/** Computes the Eastern-timezone calendar date for the given day offset from today.
 *  Returns a "YYYY-MM-DD" string. */
export function offsetToDateStr(offset: number): string {
  const { y, m, d } = getEasternToday();
  const target = new Date(y, m - 1, d + offset);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, "0");
  const td = String(target.getDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

const WEEKDAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayInfo(offset: number): { weekday: string; shortDate: string } {
  const { y, m, d } = getEasternToday();
  const target = new Date(y, m - 1, d + offset);
  return {
    weekday: WEEKDAY_ABBREVS[target.getDay()],
    shortDate: `${target.getMonth() + 1}/${target.getDate()}`,
  };
}

const OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

// Approximate pixel width of each pill + margin, used to scroll today into center
const PILL_WIDTH = 68;
const TODAY_PILL_WIDTH = 78;
const DIVIDER_WIDTH = 1 + 16; // divider + surrounding margins
const SCREEN_HALF = 200; // rough half-screen estimate

export default function DatePicker({ selectedOffset, onSelectOffset }: DatePickerProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Scroll so today is visible/centered on first render
  useEffect(() => {
    // 5 past pills + 1 divider before today
    const xOffset =
      5 * PILL_WIDTH + DIVIDER_WIDTH - SCREEN_HALF + TODAY_PILL_WIDTH / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, xOffset), animated: false });
  }, []);

  return (
    <View style={s.wrapper}>
      {/* Section header labels */}
      <View style={s.labelRow}>
        <Text style={s.labelPast}>Past</Text>
        <Text style={s.labelToday}>Today</Text>
        <Text style={s.labelFuture}>Upcoming</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {OFFSETS.map((offset) => {
          const isSelected = offset === selectedOffset;
          const isToday = offset === 0;
          const isPast = offset < 0;
          const { weekday, shortDate } = getDayInfo(offset);

          // Divider before today and before first future day
          const showLeftDivider = offset === 0 || offset === 1;

          return (
            <View key={offset} style={s.pillOuter}>
              {showLeftDivider && (
                <View style={[s.divider, offset === 0 ? s.dividerPastToday : s.dividerTodayFuture]} />
              )}

              <Pressable
                onPress={() => onSelectOffset(offset)}
                accessibilityRole="button"
                accessibilityLabel={isToday ? "Today" : `${weekday} ${shortDate}`}
                accessibilityState={{ selected: isSelected }}
                style={[
                  s.pill,
                  isPast
                    ? isSelected
                      ? s.pillPastSelected
                      : s.pillPast
                    : isToday
                    ? isSelected
                      ? s.pillTodaySelected
                      : s.pillTodayUnselected
                    : isSelected
                    ? s.pillFutureSelected
                    : s.pillFuture,
                ]}
              >
                {isToday ? (
                  <>
                    <Text
                      style={[
                        s.pillTodayLabel,
                        isSelected ? s.textWhite : s.textOrange,
                      ]}
                    >
                      TODAY
                    </Text>
                    <Text
                      style={[
                        s.pillDate,
                        isSelected ? s.textWhiteDim : s.textOrangeDim,
                      ]}
                    >
                      {shortDate}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        s.pillWeekday,
                        isPast
                          ? isSelected
                            ? s.textPastSelected
                            : s.textPast
                          : isSelected
                          ? s.textWhite
                          : s.textFuture,
                      ]}
                    >
                      {weekday}
                    </Text>
                    <Text
                      style={[
                        s.pillDate,
                        isPast
                          ? isSelected
                            ? s.textPastDateSelected
                            : s.textPastDate
                          : isSelected
                          ? s.textWhiteDim
                          : s.textFutureDate,
                      ]}
                    >
                      {shortDate}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    paddingTop: 4,
    paddingBottom: 8,
  },

  // Section label row above the pills
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  labelPast: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  labelToday: {
    fontSize: 10,
    fontWeight: "700",
    color: "#f97316",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  labelFuture: {
    fontSize: 10,
    fontWeight: "600",
    color: "#38bdf8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  scrollContent: {
    paddingHorizontal: 16,
    alignItems: "center",
  },

  pillOuter: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Thin dividers between sections
  // Fix: 8-digit hex (#rrggbbaa) is not reliably supported in all RN versions.
  // Use rgba() instead.
  divider: {
    width: 1,
    height: 44,
    marginHorizontal: 8,
  },
  dividerPastToday: {
    backgroundColor: "rgba(234, 88, 12, 0.27)",
  },
  dividerTodayFuture: {
    backgroundColor: "rgba(56, 189, 248, 0.27)",
  },

  // Base pill
  pill: {
    width: 62,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    minHeight: 52,
  },

  // Past variants
  pillPast: {
    backgroundColor: "#1e293b",
  },
  pillPastSelected: {
    backgroundColor: "#334155",
    borderWidth: 1,
    borderColor: "#64748b",
  },

  // Today variants
  pillTodayUnselected: {
    backgroundColor: "#431407",
    borderWidth: 1.5,
    borderColor: "#ea580c",
    width: 70,
  },
  pillTodaySelected: {
    backgroundColor: "#f97316",
    width: 70,
  },

  // Future variants
  pillFuture: {
    backgroundColor: "#0c1a2e",
    borderWidth: 1,
    borderColor: "#1e3a5f",
  },
  pillFutureSelected: {
    backgroundColor: "#1d4ed8",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },

  // Text styles
  pillTodayLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pillWeekday: {
    fontSize: 12,
    fontWeight: "700",
  },
  pillDate: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },

  // Color tokens
  // Fix: rgba() used throughout instead of 8-digit hex (#rrggbbaa).
  // Fix: past text brightened for contrast on #1e293b background.
  textWhite: { color: "#ffffff" },
  textWhiteDim: { color: "rgba(255, 255, 255, 0.67)" },
  textOrange: { color: "#f97316" },
  textOrangeDim: { color: "rgba(234, 88, 12, 0.60)" },
  // Brightened: was #64748b (too dim on #1e293b), now #94a3b8
  textPast: { color: "#94a3b8" },
  textPastSelected: { color: "#cbd5e1" },
  // Brightened: was #475569 (very dark on #1e293b), now #7a8fa6
  textPastDate: { color: "#7a8fa6" },
  textPastDateSelected: { color: "#94a3b8" },
  textFuture: { color: "#60a5fa" },
  // Fix: was #3b82f699 (8-digit hex), now rgba()
  textFutureDate: { color: "rgba(59, 130, 246, 0.60)" },
});
