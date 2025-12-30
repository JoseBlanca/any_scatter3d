import numpy

from any_scatter3d.scatter3d import Scatter3dWidget


def test_xyz_bytes_t_packs_float32_row_major():
    # Use a dtype that is not float32 to ensure conversion is tested.
    xyz = numpy.array(
        [
            [1.0, 2.0, 3.0],
            [4.5, 5.5, 6.5],
        ],
        dtype=numpy.float64,
    )

    # Minimal category stub: just needs num_values for constructor checks
    class _CatStub:
        def __init__(self, n):
            self._n = n

        @property
        def num_values(self):
            return self._n

    w = Scatter3dWidget(xyz=xyz, category=_CatStub(n=2))

    expected = numpy.asarray(xyz, dtype=numpy.float32, order="C").tobytes(order="C")
    assert w.xyz_bytes_t == expected
    assert isinstance(w.xyz_bytes_t, (bytes, bytearray))

    # Round-trip decode
    decoded = numpy.frombuffer(w.xyz_bytes_t, dtype=numpy.float32).reshape(-1, 3)
    numpy.testing.assert_allclose(decoded, xyz.astype(numpy.float32))
