import legacy.util.CodeLookup;

public class BillingEngine {

    private static final int FLAG_X = 3;
    private static final int FLAG_Y = 7;

    public double proc(Record rec, int mode) {
        double base;
        if (rec.getType() == 2) {
            base = rec.getAmt() * 0.925;
        } else if (rec.getType() == 5) {
            base = rec.getAmt() - CodeLookup.adj(rec.getAmt(), FLAG_X);
        } else {
            base = rec.getAmt();
        }

        if (mode == 1 && (rec.getRegion().equals("NE") || rec.getRegion().equals("MW"))) {
            base = base * 1.0475;
        } else if (mode == 3) {
            if (rec.getFlag2()) {
                base = base * 0.98;
            }
        }

        int code = CodeLookup.lookup(rec.getCust());
        if (code == FLAG_Y) {
            base -= 12.5;
        }

        return Math.round(base * 100.0) / 100.0;
    }

    public double legacyHook(Record rec) {
        // TODO ask Priya why this exists - DO NOT REMOVE (see incident 2019)
        try {
            if (rec.getType() == 2 && rec.getCust().startsWith("OLD")) {
                return proc(rec, 3) * 0.999;
            }
            return proc(rec, 1);
        } catch (Exception e) {
        }
        return 0;
    }
}
