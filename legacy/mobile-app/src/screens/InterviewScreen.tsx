import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Palette — Data-Driven Elegance (Navy / Slate / Gold)
// ---------------------------------------------------------------------------

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';

const TOTAL_QUESTIONS = 6;

import { API_BASE } from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  options?: string[];
}

interface QuestionItem {
  scenario: string;
  options: string[];
}

interface InterviewSessionData {
  id: number;
  lead_id: number;
  questions: QuestionItem[];
  answers: string[];
  current_question_index: number;
  is_complete: boolean;
  created_at: string;
}

interface RespondResult {
  session: InterviewSessionData;
  next_question: QuestionItem | null;
  is_complete: boolean;
}

interface LeadData {
  id: number;
  lead_description: string | null;
  [key: string]: unknown;
}

export interface InterviewScreenProps {
  leadId: number;
  onComplete: (aiBio: string | null) => void;
  onRetake: () => void;
}

type Phase = 'loading' | 'interviewing' | 'finalizing' | 'complete' | 'error';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InterviewScreen({
  leadId,
  onComplete,
  onRetake,
}: InterviewScreenProps): React.JSX.Element {
  const [phase, setPhase]               = useState<Phase>('loading');
  const [session, setSession]           = useState<InterviewSessionData | null>(null);
  const [messages, setMessages]         = useState<InterviewMessage[]>([]);
  const [description, setDescription]   = useState<string | null>(null);
  const [currentOptions, setOptions]    = useState<string[] | null>(null);
  const [isSending, setIsSending]       = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);

  const listRef = useRef<FlatList<InterviewMessage>>(null);

  const addAIMessage = useCallback((content: string, options?: string[]) => {
    setMessages(prev => [
      ...prev,
      { id: `ai-${Date.now()}-${Math.random()}`, role: 'ai', content, options },
    ]);
    if (options) setOptions(options);
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  // onContentSizeChange fires after layout completes — more reliable than a
  // useEffect which can fire before FlatList finishes measuring new content.
  const scrollToLatest = useCallback(() => {
    const last = messages.length - 1;
    if (last < 0) return;
    listRef.current?.scrollToIndex({ index: last, animated: true, viewPosition: 0 });
  }, [messages.length]);

  // ── Finalize: generate blueprint + description ───────────────────────────

  const finalizeInterview = useCallback(async (sessionId: number) => {
    setPhase('finalizing');
    try {
      const res = await fetch(`${API_BASE}/interview/${sessionId}/complete`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Complete failed: ${res.status}`);
      const lead: LeadData = await res.json();
      setDescription(lead.lead_description ?? 'Your profile has been created.');
      setPhase('complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to finalize profile.');
      setPhase('error');
    }
  }, []);

  // ── Start session on mount ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function startSession() {
      try {
        const res = await fetch(`${API_BASE}/interview/start/${leadId}`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error(`Failed to start session: ${res.status}`);
        const data: InterviewSessionData = await res.json();
        if (cancelled) return;
        setSession(data);
        const first = data.questions[0];
        addAIMessage(first.scenario, first.options);
        setPhase('interviewing');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to start interview.');
          setPhase('error');
        }
      }
    }
    startSession();
    return () => { cancelled = true; };
  }, [leadId, addAIMessage]);

  // ── Option selected ──────────────────────────────────────────────────────

  const handleOptionSelect = useCallback(async (option: string) => {
    if (!session || isSending || phase !== 'interviewing') return;

    setOptions(null);
    setIsSending(true);
    setMessages(prev => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: option },
    ]);

    try {
      const res = await fetch(`${API_BASE}/interview/${session.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: option }),
      });
      if (!res.ok) throw new Error(`Respond failed: ${res.status}`);
      const result: RespondResult = await res.json();

      setSession(result.session);

      if (result.is_complete) {
        await finalizeInterview(result.session.id);
      } else if (result.next_question) {
        addAIMessage(result.next_question.scenario, result.next_question.options);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    } finally {
      setIsSending(false);
    }
  }, [session, isSending, phase, addAIMessage, finalizeInterview]);

  // ── Message renderer ─────────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: InterviewMessage }) => (
      <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
        <Text style={[styles.bubbleText, item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI]}>
          {item.content}
        </Text>
      </View>
    ),
    [],
  );

  const answeredCount = session?.answers.length ?? 0;
  const displayQuestion = Math.min(answeredCount + 1, TOTAL_QUESTIONS);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>Preparing your interview…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMsg ?? 'An error occurred.'}</Text>
          <Pressable style={styles.retakeButton} onPress={onRetake}>
            <Text style={styles.retakeButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Finalizing ───────────────────────────────────────────────────────────

  if (phase === 'finalizing') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>Building your compatibility profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Completion card ───────────────────────────────────────────────────────

  if (phase === 'complete') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.completionContainer}>
          <Text style={styles.completionLabel}>This is how your profile reads</Text>
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
          <View style={styles.completionActions}>
            <Pressable style={styles.retakeButton} onPress={onRetake}>
              <Text style={styles.retakeButtonText}>Retake</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={() => onComplete(description)}>
              <Text style={styles.confirmButtonText}>Confirm Profile</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Interview UI ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Compatibility Interview</Text>
          <View style={styles.progressPill}>
            <Text style={styles.progressPillText}>
              {displayQuestion} of {TOTAL_QUESTIONS}
            </Text>
          </View>
        </View>

        {/* ── Progress bar ───────────────────────────────────────────── */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(answeredCount / TOTAL_QUESTIONS) * 100}%` as `${number}%` },
            ]}
          />
        </View>

        {/* ── Message list ───────────────────────────────────────────── */}
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={scrollToLatest}
            onLayout={scrollToLatest}
            onScrollToIndexFailed={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text style={styles.emptyHint}>Your interview is about to begin…</Text>
            }
          />
        </View>

        {/* ── Options panel ──────────────────────────────────────────── */}
        {/* maxHeight caps the panel so it never pushes the message list off screen */}
        <View style={styles.optionsPanel}>
          {isSending ? (
            <ActivityIndicator color={GOLD} style={{ paddingVertical: 18 }} />
          ) : (
            <ScrollView
              style={{ maxHeight: 240 }}
              contentContainerStyle={{ gap: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {currentOptions?.map((opt, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.optionBtn, pressed && styles.optionBtnPressed]}
                  onPress={() => handleOptionSelect(opt)}
                >
                  <Text style={styles.optionBtnText}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },

  // ── Shared centered layout (loading / error / finalizing)
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: { color: SLATE, fontSize: 15, textAlign: 'center' },
  errorText:   { color: WHITE, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '50',
  },
  headerTitle: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  progressPill: {
    backgroundColor: GOLD + '20',
    borderWidth: 1,
    borderColor: GOLD + '50',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  progressPillText: { color: GOLD, fontSize: 12, fontWeight: '700' },

  // ── Progress bar
  progressTrack: {
    height: 3,
    backgroundColor: SLATE + '30',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GOLD },

  // ── Message list
  listContent: {
    paddingTop: 16,
    paddingBottom: 20,
    gap: 10,
  },
  emptyHint: { color: SLATE, fontSize: 13, textAlign: 'center', marginTop: 40 },

  // ── Bubbles
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: SLATE + '40',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: GOLD,
    borderBottomRightRadius: 4,
  },
  bubbleText:     { fontSize: 15, lineHeight: 22 },
  bubbleTextAI:   { color: WHITE },
  bubbleTextUser: { color: NAVY, fontWeight: '500' },

  // ── Options panel
  optionsPanel: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLATE + '30',
    backgroundColor: NAVY,
  },
  optionBtn: {
    borderWidth: 1,
    borderColor: GOLD + '60',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GOLD + '0F',
  },
  optionBtnPressed: { backgroundColor: GOLD + '30', borderColor: GOLD },
  optionBtnText: { color: WHITE, fontSize: 14, lineHeight: 20 },

  // ── Completion card
  completionContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    gap: 24,
  },
  completionLabel: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  descriptionCard: {
    backgroundColor: SLATE + '20',
    borderWidth: 1,
    borderColor: GOLD + '40',
    borderRadius: 16,
    padding: 20,
  },
  descriptionText: {
    color: WHITE,
    fontSize: 16,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  completionActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto' as unknown as number,
  },
  retakeButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SLATE + '80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButtonText: { color: SLATE, fontWeight: '600', fontSize: 15 },
  confirmButton: {
    flex: 2,
    height: 48,
    borderRadius: 24,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: { color: NAVY, fontWeight: '700', fontSize: 15 },
});
