import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../services/api';

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';
const DANGER = '#EF4444';

const LANGUAGES = [
  { key: 'english',   label: 'English' },
  { key: 'malayalam', label: 'Malayalam' },
  { key: 'hindi',     label: 'Hindi' },
] as const;

type Language = typeof LANGUAGES[number]['key'];

export interface OnboardingScreenProps {
  onLeadCreated: (leadId: number) => void;
}

export default function OnboardingScreen({ onLeadCreated }: OnboardingScreenProps) {
  const [phone, setPhone]         = useState('');
  const [language, setLanguage]   = useState<Language>('english');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleBegin() {
    if (loading) return;
    if (phone.trim().length < 7) {
      setError('Please enter a valid phone number (at least 7 digits).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE}/admin/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone.trim(),
          source: 'self_service',
          language_preference: language,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const lead = await res.json();
      await AsyncStorage.setItem('current_user_id', String(lead.id));
      onLeadCreated(lead.id);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Make sure the backend server is running.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not connect. Check your network.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Branding ─────────────────────────────────────────────────── */}
          <View style={styles.brandBlock}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>ZF</Text>
            </View>
            <Text style={styles.title}>Zero Fraud Matrimony</Text>
            <Text style={styles.subtitle}>
              Every profile is interview-verified.{'\n'}No fake accounts. No strangers.
            </Text>
          </View>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={SLATE}
              keyboardType="phone-pad"
              returnKeyType="done"
              maxLength={20}
              editable={!loading}
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Interview Language</Text>
            <View style={styles.languageRow}>
              {LANGUAGES.map(lang => (
                <Pressable
                  key={lang.key}
                  style={[
                    styles.langPill,
                    language === lang.key && styles.langPillActive,
                  ]}
                  onPress={() => setLanguage(lang.key)}
                >
                  <Text style={[
                    styles.langPillText,
                    language === lang.key && styles.langPillTextActive,
                  ]}>
                    {lang.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                loading && styles.ctaDisabled,
                pressed && !loading && styles.ctaPressed,
              ]}
              onPress={handleBegin}
            >
              {loading
                ? <ActivityIndicator color={NAVY} />
                : <Text style={styles.ctaText}>Begin Your Interview →</Text>
              }
            </Pressable>

            <Text style={styles.disclaimer}>
              Your number is never shared. Identity is verified before you can message anyone.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },

  // Branding
  brandBlock: { alignItems: 'center', paddingTop: 72, paddingBottom: 48, gap: 14 },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: { color: NAVY, fontSize: 26, fontWeight: '800', letterSpacing: 1 },
  title: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: SLATE,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Form
  form: { gap: 8 },
  fieldLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SLATE + '80',
    backgroundColor: SLATE + '18',
    paddingHorizontal: 16,
    color: WHITE,
    fontSize: 16,
  },

  // Language pills
  languageRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  langPill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SLATE + '80',
  },
  langPillActive: { borderColor: GOLD, backgroundColor: GOLD + '20' },
  langPillText: { color: SLATE, fontSize: 14, fontWeight: '600' },
  langPillTextActive: { color: GOLD },

  // Error
  errorBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: DANGER + '15',
    borderWidth: 1,
    borderColor: DANGER + '50',
  },
  errorText: { color: DANGER, fontSize: 13 },

  // CTA
  cta: {
    marginTop: 28,
    height: 54,
    borderRadius: 27,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: SLATE + '50' },
  ctaPressed:  { opacity: 0.8 },
  ctaText: { color: NAVY, fontSize: 16, fontWeight: '700' },

  disclaimer: {
    color: SLATE,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});
