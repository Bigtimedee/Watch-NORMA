import { ScrollView, Pressable, Text, StyleSheet } from "react-native";

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

function pillLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  // For offsets 2-5: weekday abbreviation + day number
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
  return `${WEEKDAY_ABBREVS[target.getDay()]} ${target.getDate()}`;
}

export default function DatePicker({ selectedOffset, onSelectOffset }: DatePickerProps) {
  const offsets = [0, 1, 2, 3, 4, 5];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scrollContent}
      style={s.scroll}
    >
      {offsets.map((offset) => {
        const isActive = offset === selectedOffset;
        return (
          <Pressable
            key={offset}
            style={[s.pill, isActive ? s.pillActive : s.pillInactive]}
            onPress={() => onSelectOffset(offset)}
            accessibilityLabel={pillLabel(offset)}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[s.pillText, isActive ? s.pillTextActive : s.pillTextInactive]}>
              {pillLabel(offset)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: "#f97316",
  },
  pillInactive: {
    backgroundColor: "#1e293b",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  pillTextInactive: {
    color: "#94a3b8",
  },
});
