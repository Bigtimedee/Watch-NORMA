import { ScrollView, Pressable, Text, View, StyleSheet } from "react-native";
import { useRef, useEffect } from "react";

interface DatePickerProps {
  selectedOffset: number;
  onSelectOffset: (offset: number) => void;
}

/** Computes the Eastern-timezone calendar date for the given day offset from today.
 *  Returns a "YYYY-MM-DD" string. */
export function offsetToDateStr(offset: number): string {
  const now = new Date();
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parseInt(eastern.find((p) => p.type === "year")!.value);
  const m = parseInt(eastern.find((p) => p.type === "month")!.value);
  const d = parseInt(eastern.find((p) => p.type === "day")!.value);

  const target = new Date(y, m - 1, d + offset);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, "0");
  const td = String(target.getDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

const WEEKDAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayInfo(offset: number): { weekday: string; shortDate: string } {
  const now = new Date();
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parseInt(eastern.find((p) => p.type === "year")!.value);
  const m = parseInt(eastern.find((p) => p.type === "month")!.value);
  const d = parseInt(eastern.find((p) => p.type === "day")!.value);
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
  divider: {
    width: 1,
    height: 44,
    marginHorizontal: 8,
  },
  dividerPastToday: {
    backgroundColor: "#ea580c44",
  },
  dividerTodayFuture: {
    backgroundColor: "#38bdf844",
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
  textWhite: { color: "#ffffff" },
  textWhiteDim: { color: "#ffffffaa" },
  textOrange: { color: "#f97316" },
  textOrangeDim: { color: "#ea580c99" },
  textPast: { color: "#64748b" },
  textPastSelected: { color: "#94a3b8" },
  textPastDate: { color: "#475569" },
  textPastDateSelected: { color: "#64748b" },
  textFuture: { color: "#60a5fa" },
  textFutureDate: { color: "#3b82f699" },
});
