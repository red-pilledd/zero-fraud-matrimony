import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
} from "react-native";
import { BlurView } from "expo-blur";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompatibilityBlueprint {
  values: string[];
  lifestyle: string;
  dealbreakers: string[];
  ai_summary: string;
}

export interface ProfileCardProps {
  blueprintData: CompatibilityBlueprint;
  messageCount: number;
  threshold: number;
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  navy: "#0A1628",
  navyLight: "#122040",
  slate: "#64748B",
  slateLight: "#94A3B8",
  gold: "#C9A84C",
  goldLight: "#E2C97E",
  surface: "#0F1E35",
  border: "#1E3A5F",
  white: "#FFFFFF",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileCard({
  blueprintData,
  messageCount,
  threshold,
  imageUrl,
}: ProfileCardProps): React.JSX.Element {
  const isLocked = messageCount < threshold;
  const remaining = threshold - messageCount;

  return (
    <View style={styles.card}>
      {/* Image section with conditional blur */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUrl } as ImageSourcePropType}
          style={styles.image}
          resizeMode="cover"
        />
        {isLocked && (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
            <View style={styles.lockOverlay}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.lockCountText}>
                {remaining} {remaining === 1 ? "message" : "messages"} to unlock
              </Text>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${(messageCount / threshold) * 100}%` },
                  ]}
                />
              </View>
            </View>
          </BlurView>
        )}
      </View>

      {/* Blueprint data section */}
      <View style={styles.body}>
        <Text style={styles.summaryText}>{blueprintData.ai_summary}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Values</Text>
        <View style={styles.tagRow}>
          {blueprintData.values.map((value) => (
            <View key={value} style={styles.tag}>
              <Text style={styles.tagText}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Lifestyle</Text>
        <Text style={styles.bodyText}>{blueprintData.lifestyle}</Text>

        <Text style={styles.sectionLabel}>Non-negotiables</Text>
        <View style={styles.tagRow}>
          {blueprintData.dealbreakers.map((item) => (
            <View key={item} style={[styles.tag, styles.tagDealbreaker]}>
              <Text style={[styles.tagText, styles.tagTextDealbreaker]}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  imageContainer: {
    width: "100%",
    height: 320,
    backgroundColor: COLORS.navyLight,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  lockOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  lockIcon: {
    fontSize: 32,
  },
  lockCountText: {
    color: COLORS.goldLight,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  progressBarTrack: {
    width: "70%",
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.gold,
    borderRadius: 2,
  },
  body: {
    padding: 20,
    gap: 8,
  },
  summaryText: {
    color: COLORS.white,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  sectionLabel: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 8,
  },
  bodyText: {
    color: COLORS.slateLight,
    fontSize: 14,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    backgroundColor: COLORS.navyLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: COLORS.slateLight,
    fontSize: 12,
    fontWeight: "500",
  },
  tagDealbreaker: {
    borderColor: COLORS.gold,
    backgroundColor: "rgba(201, 168, 76, 0.08)",
  },
  tagTextDealbreaker: {
    color: COLORS.goldLight,
  },
});
