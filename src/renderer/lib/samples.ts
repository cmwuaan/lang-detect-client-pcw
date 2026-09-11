export interface Sample {
  /** Nhãn hiển thị, viết bằng chính ngôn ngữ đó. */
  label: string;
  /**
   * Thẻ BCP 47 của mẫu — dùng để đối chiếu với `supportedLanguages` của
   * provider và khoá mẫu nào engine hiện tại không kết luận được.
   */
  lang: string;
  text: string;
}

/**
 * Văn bản mẫu để bấm thử nhanh.
 *
 * Danh sách cố tình RỘNG HƠN tập ngôn ngữ engine hỗ trợ: mẫu không hỗ trợ vẫn
 * hiện nhưng bị khoá, nhờ vậy người dùng thấy được giới hạn nằm ở đâu thay vì
 * tưởng engine nhận mọi thứ. Xoá hẳn chúng đi thì thông tin đó cũng mất.
 */
export const SAMPLES: Sample[] = [
  { label: 'Tiếng Việt', lang: 'vi', text: 'Một trong những điều quan trọng nhất là hiểu được người dùng của mình muốn gì, và vì sao họ cần đến sản phẩm này.' },
  { label: 'English', lang: 'en', text: 'The most important thing is to understand what the users of your product actually want, and the reason they need it at all.' },
  { label: 'Français', lang: 'fr', text: 'La chose la plus importante est de comprendre ce que les utilisateurs de votre produit veulent vraiment et pourquoi ils en ont besoin.' },
  { label: 'Español', lang: 'es', text: 'Lo más importante es comprender lo que los usuarios de tu producto quieren realmente y por qué lo necesitan en primer lugar.' },
  { label: 'Deutsch', lang: 'de', text: 'Das Wichtigste ist zu verstehen, was die Benutzer eines Produktes wirklich wollen und warum sie es überhaupt brauchen.' },
  { label: 'Bahasa', lang: 'id', text: 'Hal yang paling penting adalah memahami apa yang sebenarnya diinginkan oleh pengguna produk anda dan mengapa mereka membutuhkannya.' },
  { label: '日本語', lang: 'ja', text: '最も重要なことは、製品の利用者が本当に何を望んでいるのか、そしてなぜそれを必要としているのかを理解することです。' },
  { label: '中文', lang: 'zh', text: '最重要的事情是理解产品的使用者真正想要什么，以及他们为什么需要这个产品。' },
  { label: '한국어', lang: 'ko', text: '가장 중요한 것은 제품 사용자가 실제로 무엇을 원하는지, 그리고 왜 그것을 필요로 하는지를 이해하는 것입니다.' },
  { label: 'ไทย', lang: 'th', text: 'สิ่งที่สำคัญที่สุดคือการเข้าใจว่าผู้ใช้ผลิตภัณฑ์ของคุณต้องการอะไรจริง ๆ และเพราะเหตุใดพวกเขาจึงต้องการสิ่งนั้น' },
];
