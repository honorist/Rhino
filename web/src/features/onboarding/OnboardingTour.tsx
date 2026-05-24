import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOUR_STEPS, type TourStep, markTourSeen } from './tourSteps';

/**
 * Shepherd.js v14 via npm. Carregado por import dinâmico para code-split.
 * Porte da função startTour de js/onboarding.js — usa o mesmo storage key
 * (TOUR_STORAGE_KEY) e mesmos textos, mas com seletores e navegação
 * adaptados ao React.
 */

interface OnboardingTourProps {
  /** True para iniciar imediatamente quando montar. */
  active: boolean;
  /** Callback ao concluir/cancelar. */
  onFinish?: () => void;
}

function waitForElement(selector: string, timeoutMs = 1400): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      try {
        if (document.querySelector(selector) || Date.now() > deadline) {
          resolve();
          return;
        }
      } catch {
        /* selector inválido — não bloqueia */
        resolve();
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

export default function OnboardingTour({ active, onFinish }: OnboardingTourProps) {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        // Carrega CSS + JS sob demanda.
        await import('shepherd.js/dist/css/shepherd.css');
        const ShepherdMod = await import('shepherd.js');
        if (cancelled) return;
        // shepherd.js exporta Tour como named + namespace default; normalizamos.
        const Shepherd = (ShepherdMod as unknown as { default?: typeof ShepherdMod }).default ?? ShepherdMod;

        const tour = new Shepherd.Tour({
          useModalOverlay: true,
          defaultStepOptions: {
            cancelIcon: { enabled: true },
            classes: 'rh-tour-step',
            scrollTo: { behavior: 'smooth', block: 'center' },
          },
        });

        TOUR_STEPS.forEach((step, i) => {
          const isFirst = i === 0;
          const isLast = i === TOUR_STEPS.length - 1;

          const resolveAttach = (s: TourStep) => {
            if (!s.element) return undefined;
            const present = document.querySelector(s.element);
            return { element: present ? s.element : '#app', on: s.on ?? 'bottom' };
          };

          // Botões: primeiro/último divergem do meio (que herda padrão).
          let buttons:
            | undefined
            | Array<{ text: string; secondary?: boolean; action: (this: { back: () => void; next: () => void; complete: () => void }) => void }>;
          if (isFirst) {
            buttons = [
              {
                text: 'Começar →',
                action: function () {
                  this.next();
                },
              },
            ];
          } else if (isLast) {
            buttons = [
              {
                text: '← Anterior',
                secondary: true,
                action: function () {
                  this.back();
                },
              },
              {
                text: '✅ Concluir',
                action: function () {
                  this.complete();
                },
              },
            ];
          } else {
            buttons = [
              {
                text: '← Anterior',
                secondary: true,
                action: function () {
                  this.back();
                },
              },
              {
                text: 'Próximo →',
                action: function () {
                  this.next();
                },
              },
            ];
          }

          tour.addStep({
            id: step.id,
            title: step.title,
            text: step.text,
            attachTo: resolveAttach(step),
            buttons,
            beforeShowPromise: async () => {
              if (step.navigateTo) {
                navigate(step.navigateTo);
                await waitForElement(step.element ?? '#app');
              }
              // Re-resolve alvo caso ele apareça depois.
              const current = tour.getById(step.id);
              if (current && step.element) {
                current.updateStepOptions({ attachTo: resolveAttach(step) });
              }
            },
          });
        });

        const finish = () => {
          markTourSeen();
          onFinish?.();
        };
        tour.on('complete', finish);
        tour.on('cancel', finish);
        tour.start();
      } catch (e) {
        console.warn('[tour]', e);
        onFinish?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, navigate, onFinish]);

  return null;
}
