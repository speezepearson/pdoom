export type Year = number;
export type Prob = number;
export type Ensemble<T> = Map<T, Prob>;
export type History<T> = Array<Ensemble<T>>;
export type TransitionFunction<T> = (x: T) => Ensemble<T>;

export function step<T>(
  ensemble: Ensemble<T>,
  transition: TransitionFunction<T>
): Ensemble<T> {
  const result = new Map<T, Prob>();
  Array.from(ensemble.entries()).forEach(([cur, probability]) => {
    Array.from(transition(cur).entries()).forEach(([next, nextProbability]) => {
      const totalProbability = probability * nextProbability;
      const currentProbability = result.get(next) || 0;
      result.set(next, currentProbability + totalProbability);
    });
  });
  return result;
}

export function extrapolate<T>(
  start: T,
  transition: TransitionFunction<T>,
  nSteps: number
): History<T> {
  const result: Ensemble<T>[] = [];
  let current = new Map<T, Prob>([[start, 1]]);
  for (let i = 0; i < nSteps; i++) {
    result.push(current);
    current = step(current, transition);
  }
  return result;
}

export function mix<T>(ensembles: [Ensemble<T>, number][]): Ensemble<T> {
  const totalWeight = ensembles.reduce((acc, [_, weight]) => acc + weight, 0);
  const result = new Map<T, Prob>();
  ensembles.forEach(([ensemble, weight]) => {
    Array.from(ensemble.entries()).forEach(([value, probability]) => {
      const currentProbability = result.get(value) || 0;
      result.set(
        value,
        currentProbability + (probability * weight) / totalWeight
      );
    });
  });
  return result;
}

export function mixHistories<T>(histories: [History<T>, number][]): History<T> {
  const result: Ensemble<T>[] = [];
  for (let i = 0; i < histories[0][0].length; i++) {
    const ensembles: [Ensemble<T>, number][] = histories.map(
      ([history, weight]) => [history[i], weight]
    );
    result.push(mix(ensembles));
  }
  return result;
}

export function extrapolateAndMix<T>(
  start: T,
  models: Ensemble<TransitionFunction<T>>,
  nSteps: number
): History<T> {
  const histories: [History<T>, number][] = Array.from(models.entries()).map(
    ([model, weight]) => [extrapolate(start, model, nSteps), weight]
  );
  return mixHistories(histories);
}

export function normalize<T>(ensemble: Map<T, number>): Ensemble<T> {
  const total = Array.from(ensemble.values()).reduce((a, b) => a + b, 0);
  return new Map(
    Array.from(ensemble.entries()).map(([k, v]) => [k, v / total])
  );
}

export function pFromOdds<T extends { [k: string]: number }>(
  odds: T,
  key: keyof T
): Prob {
  return odds[key] / Object.values(odds).reduce((a, b) => a + b, 0);
}

export type World = Year | "dead" | "heaven" | "reset";

export type SimpleAGIModel = (year: Year) => {
  p: Prob;
  odds: { heaven: number; dead: number; reset: number };
};
export type SimpleNukeModel = (year: Year) => {
  p: Prob;
  odds: { dead: number; reset: number };
};
export type SimplePlagueModel = (year: Year) => {
  p: Prob;
  odds: { dead: number; reset: number };
};
export function simpleTransitionFunction(opts: {
  agi: SimpleAGIModel;
  nukes: SimpleNukeModel;
  plague: SimplePlagueModel;
}): TransitionFunction<World> {
  return (world) => {
    switch (world) {
      case "dead":
      case "heaven":
      case "reset":
        return new Map<World, Prob>([[world, 1]]);
      default:
        const year: Year = world;
        const agi = opts.agi(year);
        const nukes = opts.nukes(year);
        const plague = opts.plague(year);

        const pHeaven = agi.p * pFromOdds(agi.odds, "heaven");
        const pDead =
          agi.p * pFromOdds(agi.odds, "dead") +
          nukes.p * pFromOdds(nukes.odds, "dead") +
          plague.p * pFromOdds(plague.odds, "dead");
        const pReset =
          agi.p * pFromOdds(agi.odds, "reset") +
          nukes.p * pFromOdds(nukes.odds, "reset") +
          plague.p * pFromOdds(plague.odds, "reset");

        return new Map<World, Prob>([
          ["heaven", pHeaven],
          ["dead", pDead],
          ["reset", pReset],
          [year + 1, 1 - pHeaven - pDead - pReset],
        ]);
    }
  };
}

export const stdSigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function buildModels(opts: {
  work: boolean;
}): Ensemble<TransitionFunction<World>> {
  const accelerationFromWorking = 1 + (opts.work ? 1e-7 : 0);

  const agiModels = normalize(
    new Map<SimpleAGIModel, number>([
      // Model: Eliezer is right; we're doomed.
      //   5% chance of AGI this year, and it doubles every decade.
      //   AI safety isn't going to get solved this decade, but it could in a century.
      //   If we don't solve AI safety before building AGI, it eats us with certainty.
      [
        (year) => ({
          p: Math.min(
            1,
            accelerationFromWorking * 0.05 * 2 ** ((year - 2022) / 10)
          ),
          odds: {
            heaven: stdSigmoid((year - 2080) / 20),
            dead: 1 - stdSigmoid((year - 2080) / 20),
            reset: 0,
          },
        }),
        1,
      ],

      // Model: Paul Christiano is right: chance of death from AGI is ~20%.
      //   https://www.lesswrong.com/posts/CoZhXrhpQxpy9xw9y/where-i-agree-and-disagree-with-eliezer?commentId=EG2iJLKQkb2sTcs4o
      //   And it's probably a couple decades away.
      [
        (year) => ({
          p: Math.min(
            1,
            accelerationFromWorking * 0.02 * 2 ** ((year - 2022) / 10)
          ),
          odds: {
            heaven: stdSigmoid((year - 2030) / 10),
            dead: ((1 - stdSigmoid((year - 2030) / 10)) * 2) / 3,
            reset: ((1 - stdSigmoid((year - 2030) / 10)) * 1) / 3,
          },
        }),
        1,
      ],

      // Model: AGI is hard, but coming.
      //   2% chance of AGI this year, and it doubles every decade.
      //   AI safety isn't going to get solved this decade, but it could in a century.
      //   If we don't solve AI safety before building something AGI-ish, it will probably
      //     obliterate industrial civilization, with a good chance of extinction.
      [
        (year) => ({
          p: Math.min(
            1,
            accelerationFromWorking * 0.03 * 2 ** ((year - 2022) / 10)
          ),
          odds: {
            heaven: stdSigmoid((year - 2080) / 20),
            dead: (1 - stdSigmoid((year - 2080) / 20)) / 2,
            reset: (1 - stdSigmoid((year - 2080) / 20)) / 2,
          },
        }),
        1,
      ],

      // Model: AGI is way harder than I think.
      //   0.1% chance of AGI this year, and it doubles every 30 years.
      //   By the time we get it, we'll have to understand it so intimately we can solve safety.
      [
        (year) => ({
          p: Math.min(
            1,
            accelerationFromWorking * 0.001 * 2 ** ((year - 2022) / 30)
          ),
          odds: {
            heaven: stdSigmoid((year - 2080) / 20),
            dead: 0,
            reset: 0,
          },
        }),
        0.2,
      ],
    ])
  );
  const nukesModels = normalize(
    new Map<SimpleNukeModel, number>([
      [(year) => ({ p: 0.01, odds: { dead: 0.1, reset: 0.9 } }), 1],
    ])
  );
  const plagueModels = normalize(
    new Map<SimplePlagueModel, number>([
      [
        (year) => ({
          p: 0.005,
          odds: {
            dead: 0.1,
            reset: 0.9,
          },
        }),
        1,
      ],
      [
        (year) => ({
          p: 0,
          odds: {
            dead: 0,
            reset: 1,
          },
        }),
        1,
      ],
    ])
  );

  return normalize(
    new Map<TransitionFunction<World>, number>(
      Array.from(agiModels.entries()).flatMap(([agi, agiP]) =>
        Array.from(nukesModels.entries()).flatMap(([nukes, nukesP]) =>
          Array.from(plagueModels.entries()).map(([plague, plagueP]) => [
            simpleTransitionFunction({ agi, nukes, plague }),
            agiP * nukesP * plagueP,
          ])
        )
      )
    )
  );
}
