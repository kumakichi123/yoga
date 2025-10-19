export const poseLibrary = {
  child: {　//1
    slug: "child",
    name: { ja: "チャイルドポーズ" },
    cues: [{ja:"リラックスしてキープ"}],
    imageUrl: "/pose/child.png",
    frames: [{ seconds: 30, imageUrl: "/pose/child.png", text: { ja: "呼吸により背面が膨らむ感覚を意識する" } }],
    level: 1,
    areas: ["背中",],
    tags: ["リラックス"],
  },

  "cat-cow": {  //2
    slug: "cat-cow",
    name: { ja: "キャット＆カウ" },
    cues: [{ ja: "息を吸いながら背中をそらす" }, { ja: "1,2を繰り返す" }],
    imageUrl: "/pose/cat-pose.png",
    frames: [{ seconds: 60, imageUrl: "/pose/cat-pose.png", text: { ja: "息を吐きながら背中を丸める" } }],
    level: 1,
    areas: ["背中",],
    tags: ["モビリティ"],
  },

  "down-dog": {  //3
    slug: "down-dog",
    name: { ja: "ダウンドッグ" },
    cues: [{ja: "しんどい場合は膝を曲げる"},],
    imageUrl: "/pose/down-dog.jpg",
    frames: [{ seconds: 60, imageUrl: "/pose/down-dog.jpg", text: { ja: "全身で床を押す" } }],
    level: 2,
    areas: ["背中", "脚", "腹部"],
    tags: ["全身"],
  },

  "seated-side-bend": {  //4
    slug: "seated-side-bend",
    name: { ja: "座位体側伸ばし" },
    cues: [],
    imageUrl: "/pose/seated-side-bend-right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/seated-side-bend-right.jpg", text: { ja: "右へ倒す" } },
      { seconds: 30, imageUrl: "/pose/seated-side-bend-left.jpg", text: { ja: "左へ倒す" } },
    ],
    level: 1,
    areas: ["肩",],
    tags: ["ストレッチ"],
  },

  "seated-twist": {  //5
    slug: "seated-twist",
    name: { ja: "座位ねじり" },
    cues: [],
    imageUrl: "/pose/seated-twist-right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/seated-twist-right.jpg", text: { ja: "右へねじる" } },
      { seconds: 30, imageUrl: "/pose/seated-twist-left.jpg", text: { ja: "左へねじる" } },
    ],
    level: 1,
    areas: ["背中", "腰"],
    tags: ["ツイスト"],
  },

  "locust-easy": {  //6
    slug: "locust-easy",
    name: { ja: "バッタ（やさしい）" },
    cues: [{ ja: "みぞおちからやさしく持ち上げる" }],
    imageUrl: "/pose/Grasshopper.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Grasshopper.png", text: { ja: "肩すくめず首長く" } }],
    level: 2,
    areas: ["背中", "胸"],
    tags: ["後屈", "背筋強化"],
  },

  malasana: {  //7
    slug: "malasana",
    name: { ja: "花輪のポーズ（マラーサナ）" },
    cues: [{ja: "自然な呼吸でキープ"}],
    imageUrl: "/pose/malasana.png",
    frames: [{ seconds: 30, imageUrl: "/pose/malasana.png", text: { ja: "かかとを床につけ、肘で足を外側に押し広げる" } }],
    level: 1,
    areas: ["股関節",],
    tags: ["ヒップオープナー"],
  },

  triangle: {  //8
    slug: "triangle",
    name: { ja: "三角のポーズ（トリコナーサナ）" },
    cues: [{ja: "肩回りの伸びを感じよう！"}],
    imageUrl: "/pose/triangle_right.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/triangle_right.png", text: { ja: "姿勢を保つ" } },
      { seconds: 30, imageUrl: "/pose/triangle_left.png", text: { ja: "姿勢を保つ" } },
    ],
    level: 2,
    areas: ["脚", "肩",],
    tags: ["ストレッチ"],
  },

  inaho: {  //9
    slug: "inaho",
    name: { ja: "いなほのポーズ" },
    cues: [{ ja: "肩を落とし胸ひらく" },{ja: "自然呼吸でキープ"}],
    imageUrl: "/pose/inaho.png",
    frames: [{ seconds: 30, imageUrl: "/pose/inaho.png", text: { ja: "自然呼吸でキープ" } }],
    level: 1,
    areas: ["肩", "背中", "胸"],
    tags: ["チェアヨガ", "ストレッチ"],
  },

  "cow-face": {  //10
    slug: "cow-face",
    name: { ja: "牛の顔のポーズ（腕）" },
    cues: [{ ja: "下の肘を体側へ寄せる" }],
    imageUrl: "/pose/cow_face_right.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/cow_face_right.png", text: { ja: "右腕上・左腕下" } },
      { seconds: 30, imageUrl: "/pose/cow_face_left.png", text: { ja: "左腕上・右腕下" } },
    ],
    level: 2,
    areas: ["肩", "背中", "胸"],
    tags: ["ストレッチ", "左右あり"],
  },

  "reverse-prayer": {  //11
    slug: "reverse-prayer",
    name: { ja: "リバース合掌のポーズ" },
    cues: [{ ja: "合掌は胸の真裏" }],
    imageUrl: "/pose/Hands_clasped.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Hands_clasped.png", text: { ja: "肩力まず胸ひらく" } }],
    level: 2,
    areas: ["肩","背中"],
    tags: ["ストレッチ"],
  },

  tree: {  //12
    slug: "tree",
    name: { ja: "木のポーズ（ヴリクシャーサナ）" },
    cues: [{ ja: "軸足で床を押す" },{ja: "難しい場合は足の位置を下げても大丈夫です"}],
    imageUrl: "/pose/tree_right_pose.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/tree_right_pose.png", text: { ja: "右足軸 → 合掌" } },
      { seconds: 30, imageUrl: "/pose/tree_left_pose.png", text: { ja: "左足軸 → 合掌" } },
    ],
    level: 2,
    areas: ["脚", "股関節",],
    tags: ["バランス", "左右あり"],
  },

  cobra: {  //13
    slug: "cobra",
    name: { ja: "コブラのポーズ（ブジャンガーサナ）" },
    cues: [{ ja: "肩を下げ首長く" }],
    imageUrl: "/pose/cobra.png",
    frames: [{ seconds: 30, imageUrl: "/pose/cobra.png", text: { ja: "恥骨で床を押す" } }],
    level: 1,
    areas: ["背中", "胸", "腰"],
    tags: ["後屈"],
  },

  frog: {  //14
    slug: "frog",
    name: { ja: "カエルのポーズ（マンドゥカーサナ）" },
    cues: [{ja: "つま先はできれば内側に向けるようにしましょう"}],
    imageUrl: "/pose/frog.png",
    frames: [{ seconds: 30, imageUrl: "/pose/frog.png", text: { ja: "股関節をやさしく開きながら態勢を低くする" } }],
    level: 1,
    areas: ["股関節"],
    tags: ["ヒップオープナー"],
  },

  parivrtta_right: {  //15
    slug: "parivrtta_right",
    name: { ja: "ねじったランジ（右）" },
    cues: [],
    imageUrl: "/pose/Parivrtta_right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/Parivrtta_right.jpg", text: { ja: "前脚側へねじる" } },
      { seconds: 30, imageUrl: "/pose/Parivrtta_left.jpg", text: { ja: "前脚側へねじる" } },
    ],
    level: 2,
    areas: ["背中", "脚"],
    tags: ["ツイスト", "スタンディング"],
  },

  sukhasana: {  //16
    slug: "sukhasana",
    name: { ja: "安楽座（スカーサナ）" },
    cues: [{ja: "自然な呼吸でキープ"}],
    imageUrl: "/pose/Sukhasana.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Sukhasana.png", text: { ja: "胡坐の姿勢になり、背筋を伸ばす" } }],
    level: 1,
    areas: ["股関節", "背中"],
    tags: ["座位", "リラックス"],
  },

  gate_pose_left: {  //17
    slug: "gate_pose_left",
    name: { ja: "門のポーズ" },
    cues: [{ja: "脇腹が伸びる感覚があれば成功です！"}],
    imageUrl: "/pose/Gate_Pose_left.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/Gate_Pose_left.jpg", text: { ja: "右膝を床につけ左手を床につける" } },
      { seconds: 30, imageUrl: "/pose/Gate_Pose_right.jpg", text: { ja: "左膝を床につけ右手を床につける" } },
    ],
    level: 1,
    areas: ["腹部", "股関節"],
    tags: ["ストレッチ", "左右あり"],
  },
  "gas-release": {  //18
    slug: "gas-release",
    name: { ja: "ガス抜きのポーズ（パヴァンムクターサナ）" },
    cues: [
      { ja: "両膝を抱え、自然な呼吸でキープ" },
    ],
    imageUrl: "/pose/gas-release.png",
    frames: [
      { seconds: 60, imageUrl: "/pose/gas-release.png", text: { ja: "" } },
    ],
    level: 1,
    areas: ["腰", "腹部",],
    tags: ["リラックス", "消化促進", "仰向け"]
  },
  
  "dolphin-plank": {  //19
    slug: "dolphin-plank",
    name: { ja: "ドルフィンプランク（前腕プランク）" },
    cues: [
      { ja: "肘で床を押し背中を広く保つ" },
      { ja: "体を一直線にキープ" }
    ],
    imageUrl: "/pose/Dolphin_Plank.jpeg",
    frames: [
      { seconds: 30, imageUrl: "/pose/Dolphin_Plank.jpeg", text: { ja: "" } }
    ],
    level: 2,
    areas: [ "肩", "腕", "腹部"],
    tags: ["体幹強化", "プランク"]
  },

  "camel": {  //20
    slug: "camel",
    name: { ja: "ラクダのポーズ（セツバンダーサナ）" },
    cues: [
      { ja: "①の姿勢になり、胸はつき出す" },
      { ja: "体を前に出したまま、片手ずつお尻から手を離し、かかとをつかんで②の姿勢になる" }
    ],
    imageUrl: "/pose/camel.jpeg",
    frames: [
      { seconds: 30, imageUrl: "/pose/camel.jpeg", text: { ja: "" } }
    ],
    level: 2,
    areas: ["腹部", "脚", "背中"],
    tags: ["後屈", "リラックス"]
  },
  "bow": {  //21
    slug: "bow",
    name: { ja: "弓のポーズ（ウシュトラアサナ）" },
    cues: [
      { ja: "腰を前に押し出し胸を開く" },
      { ja: "首を無理に後ろへ倒さない" }
    ],
    imageUrl: "/pose/bow.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/bow.png", text: { ja: "" } }
    ],
    level: 2,
    areas: ["胸", "腹部", "太もも", "肩"],
    tags: ["後屈", "姿勢改善", "筋力強化"]
  },
  "upward-salute": {  //22
    slug: "upward-salute",
    name: { ja: "上向きの万歳のポーズ（ウールドヴァ・ハスターサナ）" },
    cues: [
      { ja: "かかとをつけたまま両腕を上げる" },
      { ja: "肩を下げて背筋を伸ばす。肩回りと背骨の伸びを感じる" }
    ],
    imageUrl: "/pose/upward-salute.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/upward-salute.png", text: { ja: "" } }
    ],
    level: 1,
    areas: ["肩", "背中", "腹部"],
    tags: ["ストレッチ", "立位", "姿勢改善"]
  },
  "bridge": {  //23
    "slug": "bridge",
    "name": { "ja": "ブリッジのポーズ" },
    "cues": [
      { "ja": "仰向けで手足を踏みしめ、頭頂を軽く床につける" },
      { "ja": "肘を寄せて胸を開く" },
      { "ja": "呼吸を保ち背中の伸びを感じる" }
    ],
    "imageUrl": "/pose/brigde.jpeg",
    "frames": [
      { "seconds": 20, "imageUrl": "/pose/brigde.jpeg", "text": { "ja": "" } }
    ],
    "level": 2,
    "areas": ["背中", "肩"],
    "tags": ["後屈", "準備"],
  },
  "half-forward-fold": {  //24
    "slug": "half-forward-fold",
    "name": { "ja": "半分の立位前屈（アルダ・ウッターナーサナ）" },
    "cues": [
      { "ja": "足は腰幅にして背骨を長く保つ" },
      { "ja": "胸を前に引き出し首を中立に保つ" },
      { "ja": "膝を軽く緩め下腹を引き入れる" }
    ],
    "imageUrl": "/pose/Half_Forward_Fold.jpeg",
    "frames": [
      { "seconds": 20, "imageUrl": "/pose/Half_Forward_Fold.jpeg", "text": { "ja": "" } }
    ],
    "level": 1,
    "areas": ["背中", "脚"],
    "tags": ["前屈", "立位"],
  },
  "crescent-moon": {  //25
    "slug": "crescent-moon",
    "name": { "ja": "三日月のポーズ（アンジャネーヤーサナ）" },
    "cues": [
      { "ja": "前膝は踵の上に、後ろ脚はまっすぐ後ろへ伸ばす" },
      { "ja": "骨盤を正面に保ち、胸を開いて腕を上げる" },
      { "ja": "下腹を引き入れ、背骨を長く保つ" }
    ],
    "imageUrl": "/pose/Crescent_moon.jpeg",
    "frames": [
      { "seconds": 20, "imageUrl": "/pose/Crescent_moon.jpeg", "text": { "ja": "" } }
    ],
    "level": 1,
    "areas": ["股関節", "脚"],
    "tags": ["ストレッチ", "後屈"],
  },
  "cow": {  //26
    "slug": "cow",
    "name": { "ja": "カウポーズ（ビティラーサナ）" },
    "cues": [
      { "ja": "四つ這いで手は肩の下、膝は腰の下に置く" },
      { "ja": "吸って胸を前に出し、背中を反らせる" },
      { "ja": "尾骨と頭頂を引き離し、背骨を伸ばす" }
    ],
    "imageUrl": "/pose/cow.png",
    "frames": [
      { "seconds": 20, "imageUrl": "/pose/cow.png", "text": { "ja": "" } }
    ],
    "level": 1,
    "areas": ["背中", "胸"],
    "tags": ["後屈", "四つ這い"],
  },
};
