import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import {
  type AppSocket,
  type FrostedGlassUnlockedPayload,
  type ServerMessage,
  getSocket,
} from '../services/socket';

// ---------------------------------------------------------------------------
// Palette — Data-Driven Elegance (Navy / Slate / Gold)
// ---------------------------------------------------------------------------

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';

// Distinct muted tones for the gallery placeholder frames
const GALLERY_SWATCHES = ['#1B3A5C', '#2A4A6E', '#163352', '#223D62'] as const;

const THRESHOLD = 15;
const GALLERY_SIZE = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  fromUserId: string;
  content: string;
  timestamp: number;
  messageCount: number;
}

export interface ChatScreenProps {
  currentUserId: string;
  currentUserStake: number;
  partnerUserId: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Always-visible left panel in the Match Profile header. */
function PrimaryVibePhoto(): React.JSX.Element {
  return (
    <View style={photoStyles.container}>
      <View style={photoStyles.frame}>
        {/* Avatar silhouette */}
        <View style={photoStyles.avatarCircle} />
        <View style={photoStyles.avatarBody} />
      </View>
      <View style={photoStyles.badge}>
        <Text style={photoStyles.badgeText}>Primary Vibe</Text>
      </View>
    </View>
  );
}

const photoStyles = StyleSheet.create({
  container: {
    width: 108,
    alignItems: 'center',
    gap: 6,
  },
  frame: {
    width: 108,
    height: 148,
    borderRadius: 14,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: GOLD + '60',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  avatarCircle: {
    position: 'absolute',
    top: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GOLD + '40',
    borderWidth: 2,
    borderColor: GOLD + '80',
  },
  avatarBody: {
    width: '100%',
    height: 68,
    borderTopLeftRadius: 54,
    borderTopRightRadius: 54,
    backgroundColor: GOLD + '25',
  },
  badge: {
    backgroundColor: GOLD,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: NAVY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

// ---------------------------------------------------------------------------

interface LockedGalleryProps {
  /** One Animated.Value per thumbnail, driven by the stagger animation. */
  blurAnims: Animated.Value[];
  isBlurred: boolean;
}

/** 2 × 2 grid of placeholder photos with animated blur overlays. */
function LockedGallery({ blurAnims, isBlurred }: LockedGalleryProps): React.JSX.Element {
  return (
    <View style={galleryStyles.root}>
      <Text style={galleryStyles.label}>
        {isBlurred ? 'Locked Gallery' : 'Gallery Unlocked'}
      </Text>
      <View style={galleryStyles.grid}>
        {GALLERY_SWATCHES.map((swatch, i) => (
          <View
            key={i}
            style={[galleryStyles.thumb, { backgroundColor: swatch }]}
          >
            {/* Decorative photo-like lines inside each placeholder */}
            <View style={galleryStyles.thumbLine} />
            <View style={[galleryStyles.thumbLine, galleryStyles.thumbLineMid]} />

            {/* Animated blur+lock overlay — fades out on unlock */}
            <Animated.View
              style={[StyleSheet.absoluteFillObject, { opacity: blurAnims[i] }]}
              pointerEvents="none"
            >
              <BlurView
                intensity={90}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              />
              {/* Lock icon on top of blur */}
              <View style={galleryStyles.lockOverlay}>
                <Text style={galleryStyles.lockIcon}>🔒</Text>
              </View>
            </Animated.View>
          </View>
        ))}
      </View>
    </View>
  );
}

const galleryStyles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: SLATE,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  thumb: {
    // Two thumbs per row — (flex: 1) inside a flexWrap row gives equal sizing.
    // minWidth forces a two-column layout at all screen widths.
    flexBasis: '47%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  thumbLine: {
    position: 'absolute',
    bottom: 22,
    left: 10,
    right: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: WHITE + '15',
  },
  thumbLineMid: {
    bottom: 14,
    right: 28,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 22,
  },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatScreen({
  currentUserId,
  currentUserStake,
  partnerUserId,
}: ChatScreenProps): React.JSX.Element {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [inputText, setInputText]   = useState('');
  const [messageCount, setCount]    = useState(0);
  const [isBlurred, setIsBlurred]   = useState(true);
  const [isConnected, setConnected] = useState(false);

  const socketRef = useRef<AppSocket | null>(null);
  const listRef   = useRef<FlatList<Message>>(null);

  // One Animated.Value per gallery thumbnail.
  // Starts at 1 (blur fully opaque) → 0 (blur fully transparent) on unlock.
  const blurAnims = useRef<Animated.Value[]>(
    Array.from({ length: GALLERY_SIZE }, () => new Animated.Value(1)),
  ).current;

  // ── Socket lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket(currentUserId, currentUserStake);
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Guard against unhandled EventEmitter errors crashing Expo Go on mount
    // when the server is unreachable or the Stake middleware rejects.
    socket.on('connect_error', (err: Error) => {
      console.warn('[socket] connect_error:', err.message);
      setConnected(false);
    });

    socket.on('receiveMessage', (msg: ServerMessage) => {
      setMessages(prev => [
        ...prev,
        {
          id: `${msg.timestamp}-${msg.fromUserId}`,
          fromUserId: msg.fromUserId,
          content: msg.content,
          timestamp: msg.timestamp,
          messageCount: msg.messageCount,
        },
      ]);
      setCount(msg.messageCount);
    });

    // Hybrid Reveal: messages were always readable; the gallery is what unlocks.
    // Stagger-animate each thumbnail's blur overlay out, 150 ms apart.
    socket.on('frosted_glass_unlocked', (_payload: FrostedGlassUnlockedPayload) => {
      setIsBlurred(false);
      Animated.stagger(
        150,
        blurAnims.map(anim =>
          Animated.timing(anim, {
            toValue: 0,
            duration: 700,
            // useNativeDriver for opacity is supported on iOS/Android but not
            // on React Native Web — fall back to the JS driver there.
            useNativeDriver: Platform.OS !== 'web',
          }),
        ),
      ).start();
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('receiveMessage');
      socket.off('frosted_glass_unlocked');
    };
  }, [currentUserId, currentUserStake, blurAnims]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // ── Send ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('sendMessage', { toUserId: partnerUserId, content: text });
    setInputText('');
  }, [inputText, partnerUserId]);

  // ── Message renderer — always readable, no redaction ───────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMine = item.fromUserId === currentUserId;
      return (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubblePartner]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextPartner]}>
            {item.content}
          </Text>
        </View>
      );
    },
    [currentUserId],
  );

  const progressPct = Math.min(messageCount / THRESHOLD, 1);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#22C55E' : SLATE }]} />
          <Text style={styles.statusName} numberOfLines={1}>{partnerUserId}</Text>
        </View>
        <Text style={styles.statusHint}>
          {isBlurred ? 'Gallery locked' : 'Gallery unlocked ✨'}
        </Text>
      </View>

      {/* ── Match Profile header ────────────────────────────────────────── */}
      <View style={styles.profileCard}>
        <Text style={styles.profileCardTitle}>Match Profile</Text>

        <View style={styles.profileRow}>
          {/* Left: primary photo — always visible */}
          <PrimaryVibePhoto />

          {/* Right: 2×2 locked gallery */}
          <LockedGallery blurAnims={blurAnims} isBlurred={isBlurred} />
        </View>

        {/* Progress bar — visible while gallery is locked */}
        {isBlurred ? (
          <View style={styles.progressWrapper}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                Gallery unlocks after {THRESHOLD} messages
              </Text>
              <Text style={styles.progressCount}>
                {messageCount}/{THRESHOLD}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPct * 100}%` as `${number}%` },
                ]}
              />
            </View>
          </View>
        ) : (
          <View style={styles.unlockedBanner}>
            <Text style={styles.unlockedText}>
              ✨ Photos revealed — trust established
            </Text>
          </View>
        )}
      </View>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Message list — always readable ──────────────────────────────── */}
      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyHint}>
            Send a message to start the conversation.
          </Text>
        }
      />

      {/* ── Input bar ───────────────────────────────────────────────────── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message…"
          placeholderTextColor={SLATE}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline={false}
        />
        <Pressable
          style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
          onPress={handleSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '50',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusName: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  statusHint: {
    color: SLATE,
    fontSize: 12,
  },

  // Match Profile card
  profileCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '30',
  },
  profileCardTitle: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  profileRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },

  // Progress
  progressWrapper: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    color: SLATE,
    fontSize: 12,
  },
  progressCount: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    backgroundColor: SLATE + '35',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 2,
  },

  // Unlock banner
  unlockedBanner: {
    backgroundColor: GOLD + '18',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: GOLD + '40',
    alignItems: 'center',
  },
  unlockedText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SLATE + '30',
  },

  // Message list
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexGrow: 1,
  },
  emptyHint: {
    color: SLATE,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
  },

  // Bubbles
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: GOLD,
    borderBottomRightRadius: 4,
  },
  bubblePartner: {
    alignSelf: 'flex-start',
    backgroundColor: SLATE + '50',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: NAVY,
    fontWeight: '500',
  },
  bubbleTextPartner: {
    color: WHITE,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLATE + '40',
    backgroundColor: NAVY,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SLATE + '80',
    backgroundColor: SLATE + '20',
    color: WHITE,
    fontSize: 15,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.75,
  },
  sendButtonText: {
    color: NAVY,
    fontWeight: '700',
    fontSize: 15,
  },
});
