extensions [vid]

;; Candidate nodes.
breed [candidates candidate]
;; Staking relationships.
directed-link-breed [stakes stake]

;; Relationship of having a stake on a candidate.
stakes-own [
  staked-tokens                ;; Tokens staked on the target candidate.
  rewarded-tokens              ;; Reward tokens paid for this staking relationship.
]

;; Candidates, including validators.
candidates-own [
  own-stake                    ;; The candidate's stake on itself.
  validator?                   ;; Whether the candidate is currently a validator.
]

;; Delegators.
turtles-own [
  age                          ;; Number of epochs in existence.
  staking-tokens               ;; Staking tokens available to spend.
  reward-tokens                ;; Reward tokens earned by this staker.
]

globals [
  staking-epoch#
  #validators
  #candidates
  #delegators
]

to setup
  clear-all
  set staking-epoch# 0
  set #candidates 0

  set-default-shape turtles "triangle"
  set-default-shape candidates "circle"
  create-initial-validators
  reset-ticks
  ;; Video setup.
  if record-video [
    vid:start-recorder
    vid:record-interface
  ]
end

to go
  set staking-epoch# (staking-epoch# + 1)
  let current-validators (candidates with [validator?])
  set #validators (count current-validators)
  let pool-reward (block-reward / #validators)
  ask candidates with [validator?] [
    become-candidate
    distribute-reward pool-reward
  ]
  increment-age
  add-delegators
  make-some-delegators-candidates
  make-stakes
  select-validators
  tick
  ;; Capture video.
  if record-video [
    vid:record-interface
  ]
end

to create-initial-validators
  create-candidates #initial-validators [
    become-validator
    set own-stake min-candidate-stake
  ]
end

to increment-age
  ask turtles [
    set age (age + 1)
  ]
end

to distribute-reward [pool-reward]
  let pool staking-pool-tokens
  let min-validator-reward-ratio (min-validator-reward% / 100)
  ifelse (own-stake / pool) > min-validator-reward-ratio [
    let reward-unit (pool-reward / staking-pool-tokens)

    ;; Award the due reward to the validator.
    let validator-reward (reward-unit * own-stake)
    set reward-tokens (reward-tokens + validator-reward)
    move-delegator

    ;; Award the due rewards to the delegators.
    ask my-in-stakes [
      let delegator-reward (reward-unit * staked-tokens)
      ;; Update the reward for this staking relationship.
      set rewarded-tokens (rewarded-tokens + delegator-reward)
      ask end1 [
        ;; Update the total reward of the staker.
        set reward-tokens (reward-tokens + delegator-reward)
        move-delegator
      ]
    ]
  ] [
    let validator-reward (min-validator-reward-ratio * pool-reward)
    set reward-tokens (reward-tokens + validator-reward)
    move-delegator

    let delegator-staked-tokens (pool - own-stake)
    ask my-in-stakes [
      let delegator-reward
        ((pool-reward - validator-reward) * staked-tokens / delegator-staked-tokens)
      set rewarded-tokens (rewarded-tokens + delegator-reward)
      ask end1 [
        set reward-tokens (reward-tokens + delegator-reward)
        move-delegator
      ]
    ]
  ]
end

to move-delegator
  setxy (min (list staking-pool-tokens max-pxcor)) (min (list reward-tokens max-pycor))
end

;; Sorts the current candidates in the decreasing order of staking pool amounts.
to-report ordered-candidates
  let order-of-stakes [[a b] -> [staking-pool-tokens] of a > [staking-pool-tokens] of b]
  report (sort-by order-of-stakes candidates)
end

to become-delegator
  set breed turtles
  set size 7
  set color sky
end

to become-candidate
  set breed candidates
  set validator? false
  set size 7
  set color green
end

to become-validator
  set breed candidates
  set validator? true
  set size 7
  set color red
end

to make-some-delegators-candidates
  let able-delegators (turtles with [breed != candidates and staking-tokens >= min-candidate-stake])
  ;; Ensure that there are no more than `max-#candidates` after the new candidates are made.
  let #new-candidates
    (max (list 0
      (min (list (max-#candidates - count candidates) (random (sqrt (count able-delegators)))))))
  if #new-candidates > 0 [
    ask n-of #new-candidates able-delegators [
      become-candidate
      ;; Allocate a random stake between `min-candidate-stake` and `staking-tokens`.
      let the-stake ((random (staking-tokens - min-candidate-stake)) + min-candidate-stake + 1)
      set staking-tokens (staking-tokens - the-stake)
      set own-stake the-stake
      move-delegator
    ]
  ]
end

;; Selects the maximum of first max-#validators from the ordered list of candidates.
to select-validators
  ask n-of (min (list max-#validators (count candidates))) candidates [
    become-validator
  ]
end

to add-delegators
  create-turtles (random max-#new-delegators) [
    become-delegator
    set staking-tokens (random max-new-staking-tokens)
  ]
end

to make-stakes
  let the-ordered-candidates ordered-candidates
  ;; variance in the choice of the staking target
  ask turtles [
    if random (rm-stake-chance-reciprocal + 1) = 0 [
      ifelse any? my-out-stakes [
        ;; Remove an existing stake from a candidate that brought less rewards among
        ;; all candidates on which this delegator currently has stakes.
        let withdrawn 0
        ask min-one-of my-out-stakes [rewarded-tokens] [
          set withdrawn staked-tokens
          die
        ]
        set staking-tokens (staking-tokens + withdrawn)
      ] [
        if breed = candidates [
          ;; Remove own stake and become a delegator.
          set staking-tokens (staking-tokens + own-stake)
          set own-stake 0
          ask my-in-stakes [
            let withdrawn staked-tokens
            ask end1 [
              set staking-tokens (staking-tokens + withdrawn)
              move-delegator
            ]
            die
          ]
          become-delegator
          move-delegator
        ]
      ]
    ]
    ;; Stake at random on one of the candidates.
    if staking-tokens > 0 and random (add-stake-chance-reciprocal + 1) = 0 [
      let the-stake ((random staking-tokens) + 1)
      set staking-tokens (staking-tokens - the-stake)
      let target (one-of candidates with [self != myself])
      if target != nobody [
        let existing-stake (stakes with [end1 = myself and end2 = target])
        ifelse any? existing-stake [
          ; FIXME: Ensure the chosen link is unique.
          ask min-one-of existing-stake [staked-tokens] [
            set staked-tokens (staked-tokens + the-stake)
          ]
        ] [
          create-stake-to target [
            set staked-tokens the-stake
          ]
        ]
      ]
    ]
  ]
end

to-report staking-pool-tokens
  let delegator-stakes sum [staked-tokens] of my-in-stakes
  let maybe-own-stake (ifelse-value (breed = candidates) [own-stake] [0])
  report maybe-own-stake + delegator-stakes
end
@#$#@#$#@
GRAPHICS-WINDOW
411
10
1430
490
-1
-1
1.0
1
10
1
1
1
0
0
0
1
-10
1000
-10
460
1
1
1
ticks
30.0

SLIDER
5
110
204
143
#initial-validators
#initial-validators
1
100
5.0
1
1
NIL
HORIZONTAL

BUTTON
18
10
91
43
NIL
setup
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

BUTTON
91
10
154
43
NIL
go
T
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

SLIDER
5
142
204
175
min-candidate-stake
min-candidate-stake
0
500
98.0
1
1
NIL
HORIZONTAL

SLIDER
5
45
204
78
max-#validators
max-#validators
0
100
21.0
1
1
NIL
HORIZONTAL

SLIDER
5
78
204
111
max-#candidates
max-#candidates
0
1000
467.0
1
1
NIL
HORIZONTAL

SLIDER
5
175
204
208
block-reward
block-reward
0
500
90.0
1
1
NIL
HORIZONTAL

PLOT
207
45
407
201
participants
NIL
NIL
0.0
10.0
0.0
10.0
true
false
"" ""
PENS
"default" 1.0 0 -16777216 true "" "plot count turtles"
"delegators" 1.0 0 -13791810 true "" "plot count turtles with [breed != candidates]"
"candidates" 1.0 0 -10899396 true "" "plot count candidates with [not validator?]"
"validators" 1.0 0 -2674135 true "" "plot count candidates with [validator?]"
"candidates+validators" 1.0 0 -955883 true "" "plot count candidates"

PLOT
207
200
407
350
rewards
NIL
NIL
0.0
10.0
0.0
10.0
true
false
"" ""
PENS
"all" 1.0 0 -16777216 true "" "plot sum [reward-tokens] of turtles"
"delegators" 1.0 0 -13791810 true "" "plot sum [reward-tokens] of turtles with [breed != candidates]"
"candidates" 1.0 0 -10899396 true "" "plot sum [reward-tokens] of candidates with [not validator?]"
"validators" 1.0 0 -2674135 true "" "plot sum [reward-tokens] of candidates with [validator?]"
"candidates+validators" 1.0 0 -955883 true "" "plot sum [reward-tokens] of candidates"

SWITCH
154
10
301
43
record-video
record-video
1
1
-1000

BUTTON
301
10
391
43
save video
vid:save-recording \"dpos.mp4\"
NIL
1
T
OBSERVER
NIL
NIL
NIL
NIL
1

SLIDER
5
208
204
241
min-validator-reward%
min-validator-reward%
0
100
30.0
1
1
NIL
HORIZONTAL

SLIDER
5
241
204
274
max-#new-delegators
max-#new-delegators
0
100
10.0
1
1
NIL
HORIZONTAL

PLOT
207
350
407
500
stakes
NIL
NIL
0.0
10.0
0.0
10.0
true
false
"" ""
PENS
"all" 1.0 0 -16777216 true "" "plot sum [staked-tokens] of stakes"
"validators" 1.0 0 -2674135 true "" "plot sum [staked-tokens] of stakes with [any? (turtle-set end1) with [breed = candidates and validator? = true]]"
"candidates" 1.0 0 -10899396 true "" "plot sum [staked-tokens] of stakes with [any? (turtle-set end1) with [breed = candidates and validator? = false]]"
"delegators" 1.0 0 -13791810 true "" "plot sum [staked-tokens] of stakes with [any? (turtle-set end1) with [breed != candidates]]"
"candidates+validators" 1.0 0 -955883 true "" "plot sum [staked-tokens] of stakes with [any? (turtle-set end1) with [breed = candidates]]"

SLIDER
5
274
204
307
rm-stake-chance-reciprocal
rm-stake-chance-reciprocal
0
20
10.0
1
1
NIL
HORIZONTAL

SLIDER
5
307
204
340
add-stake-chance-reciprocal
add-stake-chance-reciprocal
0
20
10.0
1
1
NIL
HORIZONTAL

SLIDER
5
340
204
373
max-new-staking-tokens
max-new-staking-tokens
0
1000
207.0
1
1
NIL
HORIZONTAL

PLOT
4
500
707
655
reward distribution
reward
count
0.0
400.0
0.0
10.0
true
false
"" ""
PENS
"freq" 1.0 0 -16777216 true "" "histogram [reward-tokens] of turtles"

PLOT
707
500
1411
655
age vs rewards
age / (rewards + 1)
count
0.0
40.0
0.0
10.0
true
false
"" ""
PENS
"ratio" 1.0 0 -16777216 true "" "histogram [age / (reward-tokens + 1)] of turtles"

@#$#@#$#@
## WHAT IS IT?

This is a working simulator of a Delegated Proof of Stake (DPoS) network. The model allows to experience how the choice of values for initial parameters influences the network behavior.

## HOW IT WORKS

The model contains participants (delegators, candidates and validators) and staking relations. It proceeds in steps, each of which corresponds to one staking epoch. When the simulation starts, the initial validators are created. Then, at every step, the following happens:

- the pool rewards are distributed,
- a random number of new delegators is added to the network,
- a small number of delegators becomes candidates by making stakes on themselves,
- current stakes are made or removed using a randomized greedy strategy,
- validators are selected among candidates at random.

## HOW TO USE IT

Adjust the parameters using the sliders, click **Setup**, and then **Go** to start the simulation. To stop the simulation, click **Go** the second time.

The network view is an X-Y graph with the staking pool size increasing to the right along the X axis, and the participant reward amount increasing upwards along the Y axis. The pure delegators are blue, pure candidates are green and current validators are red. The links are directed and represent staking relations. There are also a few statistical charts with the same color legend plus additional colors: black for "all participants" and orange for "all candidates" (pure candidates and current validators).

The graph output is trimmed at the maximum coordinates and the participants whose staking pool or rewards exceed the maximum displayable limit are pinned to the maximum coordinate instead of disappearing from view.

There is an optional video recording feature that allows recording the whole interface window including the charts. To use it, turn **record-video** on before clicking **Setup**. After the simulation stops, click **save-video** to save the recording into a file. The file name is fixed as `dpos.mp4`.

## THINGS TO NOTICE

Staking in the simulator is implemented using a simple greedy strategy. This has a few noticeable implications. Participants that join early amass more rewards and tend to have bigger staking pools. Staking relations are more likely to disappear early than late because the greedy strategy prefers keeping the staking relations that bring more rewards, and that is more likely to be the case with staking relations that have been around for longer.

## THINGS TO TRY

Try increasing **min-candidate-stake** while still keeping it less than **max-new-staking-tokens** so that the participants can become candidates. This should make is more difficult to become a candidate and you should obtain higher total rewards for pure delegators than for candidates.

Try decreasing **min-candidate-stake** and you should see the total pure delegator rewards decrease below the total candidate rewards.

Try decreasing **block-reward** and increasing **rm-stake-chance-reciprocal** to see the age to reward ratio becoming more evenly distributed among participants.

## EXTENDING THE MODEL

Adding more staking strategies is needed.

## NETLOGO FEATURES

The simulation slows down soon due to the use of multiple list operations in NetLogo. It would be great to find a way to speed them up possibly by memoization or precomputation.

## RELATED MODELS

TBD

## CREDITS AND REFERENCES

For details about the DPoS, refer to the [POA Network DPoS whitepaper](https://forum.poa.network/t/posdao-white-paper/2208).
@#$#@#$#@
default
true
0
Polygon -7500403 true true 150 5 40 250 150 205 260 250

airplane
true
0
Polygon -7500403 true true 150 0 135 15 120 60 120 105 15 165 15 195 120 180 135 240 105 270 120 285 150 270 180 285 210 270 165 240 180 180 285 195 285 165 180 105 180 60 165 15

arrow
true
0
Polygon -7500403 true true 150 0 0 150 105 150 105 293 195 293 195 150 300 150

box
false
0
Polygon -7500403 true true 150 285 285 225 285 75 150 135
Polygon -7500403 true true 150 135 15 75 150 15 285 75
Polygon -7500403 true true 15 75 15 225 150 285 150 135
Line -16777216 false 150 285 150 135
Line -16777216 false 150 135 15 75
Line -16777216 false 150 135 285 75

bug
true
0
Circle -7500403 true true 96 182 108
Circle -7500403 true true 110 127 80
Circle -7500403 true true 110 75 80
Line -7500403 true 150 100 80 30
Line -7500403 true 150 100 220 30

butterfly
true
0
Polygon -7500403 true true 150 165 209 199 225 225 225 255 195 270 165 255 150 240
Polygon -7500403 true true 150 165 89 198 75 225 75 255 105 270 135 255 150 240
Polygon -7500403 true true 139 148 100 105 55 90 25 90 10 105 10 135 25 180 40 195 85 194 139 163
Polygon -7500403 true true 162 150 200 105 245 90 275 90 290 105 290 135 275 180 260 195 215 195 162 165
Polygon -16777216 true false 150 255 135 225 120 150 135 120 150 105 165 120 180 150 165 225
Circle -16777216 true false 135 90 30
Line -16777216 false 150 105 195 60
Line -16777216 false 150 105 105 60

car
false
0
Polygon -7500403 true true 300 180 279 164 261 144 240 135 226 132 213 106 203 84 185 63 159 50 135 50 75 60 0 150 0 165 0 225 300 225 300 180
Circle -16777216 true false 180 180 90
Circle -16777216 true false 30 180 90
Polygon -16777216 true false 162 80 132 78 134 135 209 135 194 105 189 96 180 89
Circle -7500403 true true 47 195 58
Circle -7500403 true true 195 195 58

circle
false
0
Circle -7500403 true true 0 0 300

circle 2
false
0
Circle -7500403 true true 0 0 300
Circle -16777216 true false 30 30 240

cow
false
0
Polygon -7500403 true true 200 193 197 249 179 249 177 196 166 187 140 189 93 191 78 179 72 211 49 209 48 181 37 149 25 120 25 89 45 72 103 84 179 75 198 76 252 64 272 81 293 103 285 121 255 121 242 118 224 167
Polygon -7500403 true true 73 210 86 251 62 249 48 208
Polygon -7500403 true true 25 114 16 195 9 204 23 213 25 200 39 123

cylinder
false
0
Circle -7500403 true true 0 0 300

dot
false
0
Circle -7500403 true true 90 90 120

face happy
false
0
Circle -7500403 true true 8 8 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Polygon -16777216 true false 150 255 90 239 62 213 47 191 67 179 90 203 109 218 150 225 192 218 210 203 227 181 251 194 236 217 212 240

face neutral
false
0
Circle -7500403 true true 8 7 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Rectangle -16777216 true false 60 195 240 225

face sad
false
0
Circle -7500403 true true 8 8 285
Circle -16777216 true false 60 75 60
Circle -16777216 true false 180 75 60
Polygon -16777216 true false 150 168 90 184 62 210 47 232 67 244 90 220 109 205 150 198 192 205 210 220 227 242 251 229 236 206 212 183

fish
false
0
Polygon -1 true false 44 131 21 87 15 86 0 120 15 150 0 180 13 214 20 212 45 166
Polygon -1 true false 135 195 119 235 95 218 76 210 46 204 60 165
Polygon -1 true false 75 45 83 77 71 103 86 114 166 78 135 60
Polygon -7500403 true true 30 136 151 77 226 81 280 119 292 146 292 160 287 170 270 195 195 210 151 212 30 166
Circle -16777216 true false 215 106 30

flag
false
0
Rectangle -7500403 true true 60 15 75 300
Polygon -7500403 true true 90 150 270 90 90 30
Line -7500403 true 75 135 90 135
Line -7500403 true 75 45 90 45

flower
false
0
Polygon -10899396 true false 135 120 165 165 180 210 180 240 150 300 165 300 195 240 195 195 165 135
Circle -7500403 true true 85 132 38
Circle -7500403 true true 130 147 38
Circle -7500403 true true 192 85 38
Circle -7500403 true true 85 40 38
Circle -7500403 true true 177 40 38
Circle -7500403 true true 177 132 38
Circle -7500403 true true 70 85 38
Circle -7500403 true true 130 25 38
Circle -7500403 true true 96 51 108
Circle -16777216 true false 113 68 74
Polygon -10899396 true false 189 233 219 188 249 173 279 188 234 218
Polygon -10899396 true false 180 255 150 210 105 210 75 240 135 240

house
false
0
Rectangle -7500403 true true 45 120 255 285
Rectangle -16777216 true false 120 210 180 285
Polygon -7500403 true true 15 120 150 15 285 120
Line -16777216 false 30 120 270 120

leaf
false
0
Polygon -7500403 true true 150 210 135 195 120 210 60 210 30 195 60 180 60 165 15 135 30 120 15 105 40 104 45 90 60 90 90 105 105 120 120 120 105 60 120 60 135 30 150 15 165 30 180 60 195 60 180 120 195 120 210 105 240 90 255 90 263 104 285 105 270 120 285 135 240 165 240 180 270 195 240 210 180 210 165 195
Polygon -7500403 true true 135 195 135 240 120 255 105 255 105 285 135 285 165 240 165 195

line
true
0
Line -7500403 true 150 0 150 300

line half
true
0
Line -7500403 true 150 0 150 150

pentagon
false
0
Polygon -7500403 true true 150 15 15 120 60 285 240 285 285 120

person
false
0
Circle -7500403 true true 110 5 80
Polygon -7500403 true true 105 90 120 195 90 285 105 300 135 300 150 225 165 300 195 300 210 285 180 195 195 90
Rectangle -7500403 true true 127 79 172 94
Polygon -7500403 true true 195 90 240 150 225 180 165 105
Polygon -7500403 true true 105 90 60 150 75 180 135 105

plant
false
0
Rectangle -7500403 true true 135 90 165 300
Polygon -7500403 true true 135 255 90 210 45 195 75 255 135 285
Polygon -7500403 true true 165 255 210 210 255 195 225 255 165 285
Polygon -7500403 true true 135 180 90 135 45 120 75 180 135 210
Polygon -7500403 true true 165 180 165 210 225 180 255 120 210 135
Polygon -7500403 true true 135 105 90 60 45 45 75 105 135 135
Polygon -7500403 true true 165 105 165 135 225 105 255 45 210 60
Polygon -7500403 true true 135 90 120 45 150 15 180 45 165 90

sheep
false
15
Circle -1 true true 203 65 88
Circle -1 true true 70 65 162
Circle -1 true true 150 105 120
Polygon -7500403 true false 218 120 240 165 255 165 278 120
Circle -7500403 true false 214 72 67
Rectangle -1 true true 164 223 179 298
Polygon -1 true true 45 285 30 285 30 240 15 195 45 210
Circle -1 true true 3 83 150
Rectangle -1 true true 65 221 80 296
Polygon -1 true true 195 285 210 285 210 240 240 210 195 210
Polygon -7500403 true false 276 85 285 105 302 99 294 83
Polygon -7500403 true false 219 85 210 105 193 99 201 83

square
false
0
Rectangle -7500403 true true 30 30 270 270

square 2
false
0
Rectangle -7500403 true true 30 30 270 270
Rectangle -16777216 true false 60 60 240 240

star
false
0
Polygon -7500403 true true 151 1 185 108 298 108 207 175 242 282 151 216 59 282 94 175 3 108 116 108

target
false
0
Circle -7500403 true true 0 0 300
Circle -16777216 true false 30 30 240
Circle -7500403 true true 60 60 180
Circle -16777216 true false 90 90 120
Circle -7500403 true true 120 120 60

tree
false
0
Circle -7500403 true true 118 3 94
Rectangle -6459832 true false 120 195 180 300
Circle -7500403 true true 65 21 108
Circle -7500403 true true 116 41 127
Circle -7500403 true true 45 90 120
Circle -7500403 true true 104 74 152

triangle
false
0
Polygon -7500403 true true 150 30 15 255 285 255

triangle 2
false
0
Polygon -7500403 true true 150 30 15 255 285 255
Polygon -16777216 true false 151 99 225 223 75 224

truck
false
0
Rectangle -7500403 true true 4 45 195 187
Polygon -7500403 true true 296 193 296 150 259 134 244 104 208 104 207 194
Rectangle -1 true false 195 60 195 105
Polygon -16777216 true false 238 112 252 141 219 141 218 112
Circle -16777216 true false 234 174 42
Rectangle -7500403 true true 181 185 214 194
Circle -16777216 true false 144 174 42
Circle -16777216 true false 24 174 42
Circle -7500403 false true 24 174 42
Circle -7500403 false true 144 174 42
Circle -7500403 false true 234 174 42

turtle
true
0
Polygon -10899396 true false 215 204 240 233 246 254 228 266 215 252 193 210
Polygon -10899396 true false 195 90 225 75 245 75 260 89 269 108 261 124 240 105 225 105 210 105
Polygon -10899396 true false 105 90 75 75 55 75 40 89 31 108 39 124 60 105 75 105 90 105
Polygon -10899396 true false 132 85 134 64 107 51 108 17 150 2 192 18 192 52 169 65 172 87
Polygon -10899396 true false 85 204 60 233 54 254 72 266 85 252 107 210
Polygon -7500403 true true 119 75 179 75 209 101 224 135 220 225 175 261 128 261 81 224 74 135 88 99

wheel
false
0
Circle -7500403 true true 3 3 294
Circle -16777216 true false 30 30 240
Line -7500403 true 150 285 150 15
Line -7500403 true 15 150 285 150
Circle -7500403 true true 120 120 60
Line -7500403 true 216 40 79 269
Line -7500403 true 40 84 269 221
Line -7500403 true 40 216 269 79
Line -7500403 true 84 40 221 269

wolf
false
0
Polygon -16777216 true false 253 133 245 131 245 133
Polygon -7500403 true true 2 194 13 197 30 191 38 193 38 205 20 226 20 257 27 265 38 266 40 260 31 253 31 230 60 206 68 198 75 209 66 228 65 243 82 261 84 268 100 267 103 261 77 239 79 231 100 207 98 196 119 201 143 202 160 195 166 210 172 213 173 238 167 251 160 248 154 265 169 264 178 247 186 240 198 260 200 271 217 271 219 262 207 258 195 230 192 198 210 184 227 164 242 144 259 145 284 151 277 141 293 140 299 134 297 127 273 119 270 105
Polygon -7500403 true true -1 195 14 180 36 166 40 153 53 140 82 131 134 133 159 126 188 115 227 108 236 102 238 98 268 86 269 92 281 87 269 103 269 113

x
false
0
Polygon -7500403 true true 270 75 225 30 30 225 75 270
Polygon -7500403 true true 30 75 75 30 270 225 225 270
@#$#@#$#@
NetLogo 6.0.4
@#$#@#$#@
@#$#@#$#@
@#$#@#$#@
<experiments>
  <experiment name="experiment" repetitions="1" runMetricsEveryStep="true">
    <setup>setup</setup>
    <go>go</go>
    <metric>count turtles</metric>
    <enumeratedValueSet variable="max-#candidates">
      <value value="467"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="min-candidate-stake">
      <value value="106"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="record-video">
      <value value="false"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="add-stake-chance-reciprocal">
      <value value="10"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="rm-stake-chance-reciprocal">
      <value value="10"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="min-validator-reward%">
      <value value="0"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="max-#new-delegators">
      <value value="10"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="block-reward">
      <value value="90"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="#initial-validators">
      <value value="10"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="max-#validators">
      <value value="21"/>
    </enumeratedValueSet>
    <enumeratedValueSet variable="max-new-staking-tokens">
      <value value="179"/>
    </enumeratedValueSet>
  </experiment>
</experiments>
@#$#@#$#@
@#$#@#$#@
default
0.0
-0.2 0 0.0 1.0
0.0 1 1.0 0.0
0.2 0 0.0 1.0
link direction
true
0
Line -7500403 true 150 150 90 180
Line -7500403 true 150 150 210 180
@#$#@#$#@
0
@#$#@#$#@
